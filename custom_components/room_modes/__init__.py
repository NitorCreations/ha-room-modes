"""Room modes custom integration."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

import voluptuous as vol

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, discovery
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    ATTR_CURRENT_ATTEMPT,
    ATTR_ENABLED,
    ATTR_DESCRIPTION,
    ATTR_FAILED_STEPS,
    ATTR_FINISHED_AT,
    ATTR_LAST_RUN_STATUS,
    ATTR_LAST_ERROR,
    ATTR_MODE_ID,
    ATTR_MODE_NAME,
    ATTR_RUNNING_STEPS,
    ATTR_STARTED_AT,
    ATTR_STATUS,
    ATTR_STEPS,
    ATTR_SUCCESSFUL_STEPS,
    ATTR_TARGETS,
    CONF_DEPENDS_ON,
    CONF_DESCRIPTION,
    CONF_ICON,
    CONF_ID,
    CONF_LABEL,
    CONF_NAME,
    CONF_PARALLEL_MODE,
    CONF_RETRY,
    CONF_SERVICE,
    CONF_SERVICE_DATA,
    CONF_STEPS,
    CONF_TARGETS,
    CONF_TIMEOUT,
    CONF_VERIFY,
    DEFAULT_ICON,
    DEFAULT_POLL_INTERVAL,
    DEFAULT_RETRY,
    DEFAULT_TIMEOUT,
    DOMAIN,
    PARALLEL_MODE_PER_TARGET,
    PARALLEL_MODE_SEQUENTIAL,
    SERVICE_RUN_ACTION,
    SERVICE_RESET_MODE,
    SERVICE_RUN_MODE,
    STATUS_FAILED,
    STATUS_IDLE,
    STATUS_NOT_ON,
    STATUS_PARTIAL,
    STATUS_PENDING,
    STATUS_RUNNING,
    STATUS_SKIPPED,
    STATUS_SUCCESS,
    VERIFY_TYPE_ATTRIBUTE,
    VERIFY_TYPE_NONE,
    VERIFY_TYPE_STATE,
)

PLATFORMS: list[Platform] = [Platform.SENSOR]

VERIFY_SCHEMA = vol.Schema(
    {
        vol.Optional("type", default=VERIFY_TYPE_NONE): vol.In(
            [VERIFY_TYPE_NONE, VERIFY_TYPE_STATE, VERIFY_TYPE_ATTRIBUTE]
        ),
        vol.Optional("entity_id"): cv.string,
        vol.Optional("attribute"): cv.string,
        vol.Optional("value"): object,
    }
)

TARGET_SCHEMA = vol.Any(cv.string, vol.Schema({cv.string: object}))

STEP_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_ID): cv.slug,
        vol.Required(CONF_LABEL): cv.string,
        vol.Optional(CONF_ICON, default=DEFAULT_ICON): cv.icon,
        vol.Required(CONF_SERVICE): cv.string,
        vol.Optional(CONF_SERVICE_DATA, default={}): dict,
        vol.Optional(CONF_DEPENDS_ON, default=[]): vol.All(
            cv.ensure_list, [cv.slug]
        ),
        vol.Optional(CONF_TARGETS, default=[]): vol.All(cv.ensure_list, [TARGET_SCHEMA]),
        vol.Optional(CONF_VERIFY, default={}): VERIFY_SCHEMA,
        vol.Optional(CONF_TIMEOUT, default=DEFAULT_TIMEOUT): vol.Coerce(float),
        vol.Optional(CONF_RETRY, default=DEFAULT_RETRY): vol.Coerce(int),
        vol.Optional(CONF_PARALLEL_MODE, default=PARALLEL_MODE_PER_TARGET): vol.In(
            [PARALLEL_MODE_PER_TARGET, PARALLEL_MODE_SEQUENTIAL]
        ),
    }
)

MODE_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_NAME): cv.string,
        vol.Optional(CONF_DESCRIPTION, default=""): cv.string,
        vol.Optional(CONF_ICON, default=DEFAULT_ICON): cv.icon,
        vol.Required(CONF_STEPS): vol.All(cv.ensure_list, [STEP_SCHEMA]),
    }
)

CONFIG_SCHEMA = vol.Schema({DOMAIN: {cv.slug: MODE_SCHEMA}}, extra=vol.ALLOW_EXTRA)

SERVICE_RUN_MODE_SCHEMA = vol.Schema({vol.Required("mode"): cv.slug})
SERVICE_RESET_MODE_SCHEMA = vol.Schema({vol.Required("mode"): cv.slug})
SERVICE_RUN_ACTION_SCHEMA = vol.Schema(
    {
        vol.Required("mode"): cv.slug,
        vol.Required("step"): cv.slug,
        vol.Optional("target_entity_id"): cv.entity_id,
    }
)


def _utcnow() -> str:
    """Return current UTC timestamp."""
    return datetime.now(tz=UTC).isoformat()


def _normalize_target(target: Any) -> dict[str, Any]:
    """Normalize a step target."""
    if isinstance(target, str):
        return {"entity_id": target, "label": target}
    normalized = dict(target)
    normalized.setdefault("label", normalized.get("entity_id", "Target"))
    return normalized


def _render_template_value(value: Any, context: dict[str, Any]) -> Any:
    """Render a string with simple .format placeholders."""
    if isinstance(value, str):
        return value.format(**context)
    if isinstance(value, list):
        return [_render_template_value(item, context) for item in value]
    if isinstance(value, dict):
        return {
            key: _render_template_value(item, context) for key, item in value.items()
        }
    return value


def _service_target_data(target_data: dict[str, Any]) -> dict[str, Any]:
    """Convert target runtime data to service-call data."""
    allowed_keys = {"entity_id", "device_id", "area_id"}
    return {
        key: value for key, value in target_data.items() if key in allowed_keys
    }


@dataclass
class StepTargetRuntime:
    """Runtime state for one target inside a step."""

    data: dict[str, Any]
    status: str = STATUS_PENDING
    started_at: str | None = None
    finished_at: str | None = None
    attempts: int = 0
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Serialize target status."""
        return {
            **self.data,
            ATTR_STATUS: self.status,
            ATTR_STARTED_AT: self.started_at,
            ATTR_FINISHED_AT: self.finished_at,
            "attempts": self.attempts,
            "error": self.error,
        }


@dataclass
class StepRuntime:
    """Runtime state for one mode step."""

    definition: dict[str, Any]
    status: str = STATUS_PENDING
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    current_attempt: int = 0
    targets: list[StepTargetRuntime] = field(default_factory=list)

    def reset(self) -> None:
        """Reset the step to a fresh pending state."""
        self.status = STATUS_PENDING
        self.started_at = None
        self.finished_at = None
        self.error = None
        self.current_attempt = 0
        self.targets = [
            StepTargetRuntime(_normalize_target(target))
            for target in self.definition.get(CONF_TARGETS, [])
        ]

    def as_dict(self) -> dict[str, Any]:
        """Serialize step status."""
        return {
            CONF_ID: self.definition[CONF_ID],
            CONF_LABEL: self.definition[CONF_LABEL],
            ATTR_STATUS: self.status,
            ATTR_STARTED_AT: self.started_at,
            ATTR_FINISHED_AT: self.finished_at,
            ATTR_LAST_ERROR: self.error,
            ATTR_CURRENT_ATTEMPT: self.current_attempt,
            CONF_DEPENDS_ON: list(self.definition.get(CONF_DEPENDS_ON, [])),
            CONF_PARALLEL_MODE: self.definition.get(CONF_PARALLEL_MODE),
            ATTR_TARGETS: [target.as_dict() for target in self.targets],
        }


@dataclass
class ModeRuntime:
    """Runtime state for one room mode."""

    mode_id: str
    definition: dict[str, Any]
    status: str = STATUS_IDLE
    started_at: str | None = None
    finished_at: str | None = None
    last_error: str | None = None
    step_runtimes: dict[str, StepRuntime] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Build per-step runtime objects."""
        self.step_runtimes = {
            step[CONF_ID]: StepRuntime(step) for step in self.definition[CONF_STEPS]
        }
        self.reset()

    def reset(self) -> None:
        """Reset the full mode state."""
        self.status = STATUS_IDLE
        self.started_at = None
        self.finished_at = None
        self.last_error = None
        for step in self.step_runtimes.values():
            step.reset()

    def snapshot(self) -> dict[str, Any]:
        """Serialize mode runtime for entity attributes."""
        steps = [step.as_dict() for step in self.step_runtimes.values()]
        return {
            ATTR_MODE_ID: self.mode_id,
            ATTR_MODE_NAME: self.definition.get(CONF_NAME, self.mode_id.replace("_", " ").title()),
            ATTR_DESCRIPTION: self.definition.get(CONF_DESCRIPTION, ""),
            ATTR_STATUS: self.status,
            ATTR_STARTED_AT: self.started_at,
            ATTR_FINISHED_AT: self.finished_at,
            ATTR_LAST_ERROR: self.last_error,
            ATTR_RUNNING_STEPS: [
                step_id
                for step_id, step in self.step_runtimes.items()
                if step.status == STATUS_RUNNING
            ],
            ATTR_FAILED_STEPS: [
                step_id
                for step_id, step in self.step_runtimes.items()
                if step.status in (STATUS_FAILED, STATUS_PARTIAL, STATUS_SKIPPED)
            ],
            ATTR_SUCCESSFUL_STEPS: [
                step_id
                for step_id, step in self.step_runtimes.items()
                if step.status == STATUS_SUCCESS
            ],
            ATTR_STEPS: steps,
        }


class RoomModeManager:
    """Execute and track room modes."""

    def __init__(self, hass: HomeAssistant, config: dict[str, Any]) -> None:
        self.hass = hass
        self.modes = config
        self.runtimes = {
            mode_id: ModeRuntime(mode_id, deepcopy(mode_def))
            for mode_id, mode_def in config.items()
        }
        self._listeners: dict[str, list[Callable[[], None]]] = defaultdict(list)
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._tracked_entity_unsubs: list[Callable[[], None]] = []
        self._setup_entity_trackers()

    @property
    def mode_ids(self) -> list[str]:
        """Return configured mode ids."""
        return list(self.runtimes)

    def mode_exists(self, mode_id: str) -> bool:
        """Return whether a mode is configured."""
        return mode_id in self.runtimes

    def _setup_entity_trackers(self) -> None:
        """Track verify entities so the UI reflects live desired-state changes."""
        entity_to_modes: dict[str, set[str]] = defaultdict(set)

        for mode_id, runtime in self.runtimes.items():
            for step in runtime.definition[CONF_STEPS]:
                if step.get(CONF_TARGETS):
                    for target in step[CONF_TARGETS]:
                        context = _normalize_target(target)
                        entity_id = _render_template_value(
                            step.get(CONF_VERIFY, {}).get("entity_id"), context
                        )
                        if entity_id:
                            entity_to_modes[entity_id].add(mode_id)
                else:
                    entity_id = step.get(CONF_VERIFY, {}).get("entity_id")
                    if entity_id:
                        entity_to_modes[entity_id].add(mode_id)

        for entity_id, mode_ids in entity_to_modes.items():
            @callback
            def _handle_change(_event, affected_mode_ids=tuple(mode_ids)) -> None:
                for affected_mode_id in affected_mode_ids:
                    self._notify(affected_mode_id)

            self._tracked_entity_unsubs.append(
                async_track_state_change_event(self.hass, [entity_id], _handle_change)
            )

    def is_running(self, mode_id: str) -> bool:
        """Return whether a mode is currently running."""
        task = self._tasks.get(mode_id)
        return task is not None and not task.done()

    @callback
    def async_add_listener(
        self, mode_id: str, listener: Callable[[], None]
    ) -> Callable[[], None]:
        """Subscribe to mode updates."""
        self._listeners[mode_id].append(listener)

        @callback
        def _remove_listener() -> None:
            self._listeners[mode_id].remove(listener)

        return _remove_listener

    @callback
    def async_get_snapshot(self, mode_id: str) -> dict[str, Any]:
        """Return current runtime snapshot."""
        return self._build_snapshot(self.runtimes[mode_id])

    @callback
    def _notify(self, mode_id: str) -> None:
        """Push updates to listening entities."""
        for listener in list(self._listeners[mode_id]):
            listener()

    def _target_is_desired(
        self, step_definition: dict[str, Any], target_runtime: StepTargetRuntime
    ) -> bool:
        """Return whether a target is currently in the desired state."""
        verify = step_definition.get(CONF_VERIFY, {})
        if verify.get("type", VERIFY_TYPE_NONE) == VERIFY_TYPE_NONE:
            return target_runtime.status == STATUS_SUCCESS
        return self._check_verify_condition(verify, target_runtime.data)

    def _step_is_desired(self, step_runtime: StepRuntime) -> bool:
        """Return whether a step is currently in the desired state."""
        if step_runtime.targets:
            return all(
                self._target_is_desired(step_runtime.definition, target)
                for target in step_runtime.targets
            )

        verify = step_runtime.definition.get(CONF_VERIFY, {})
        if verify.get("type", VERIFY_TYPE_NONE) == VERIFY_TYPE_NONE:
            return step_runtime.status == STATUS_SUCCESS
        return self._check_verify_condition(verify, {})

    def _target_current_status(
        self, step_definition: dict[str, Any], target_runtime: StepTargetRuntime
    ) -> str:
        """Return the UI status for a target."""
        if target_runtime.status == STATUS_RUNNING:
            return STATUS_RUNNING
        if self._target_is_desired(step_definition, target_runtime):
            return STATUS_SUCCESS
        if target_runtime.status == STATUS_FAILED:
            return STATUS_FAILED
        return STATUS_NOT_ON

    def _step_current_status(self, step_runtime: StepRuntime) -> str:
        """Return the UI status for a step."""
        if step_runtime.status == STATUS_RUNNING:
            return STATUS_RUNNING

        if step_runtime.targets:
            target_statuses = [
                self._target_current_status(step_runtime.definition, target)
                for target in step_runtime.targets
            ]
            if all(status == STATUS_SUCCESS for status in target_statuses):
                return STATUS_SUCCESS
            if any(status == STATUS_RUNNING for status in target_statuses):
                return STATUS_RUNNING
            if any(status == STATUS_FAILED for status in target_statuses):
                return STATUS_FAILED
            return STATUS_NOT_ON

        if self._step_is_desired(step_runtime):
            return STATUS_SUCCESS
        if step_runtime.status == STATUS_FAILED:
            return STATUS_FAILED
        return STATUS_NOT_ON

    def _build_snapshot(self, runtime: ModeRuntime) -> dict[str, Any]:
        """Build a UI-friendly snapshot with live desired-state data."""
        steps: list[dict[str, Any]] = []
        for step in runtime.step_runtimes.values():
            target_dicts = []
            for target in step.targets:
                target_current_status = self._target_current_status(step.definition, target)
                target_dicts.append(
                    {
                        **target.as_dict(),
                        CONF_ICON: target.data.get(CONF_ICON),
                        "run_status": target.status,
                        ATTR_STATUS: target_current_status,
                        "is_desired": target_current_status == STATUS_SUCCESS,
                    }
                )

            step_current_status = self._step_current_status(step)
            steps.append(
                {
                    CONF_ID: step.definition[CONF_ID],
                    CONF_LABEL: step.definition[CONF_LABEL],
                    CONF_ICON: step.definition.get(CONF_ICON, DEFAULT_ICON),
                    ATTR_STATUS: step_current_status,
                    "run_status": step.status,
                    ATTR_STARTED_AT: step.started_at,
                    ATTR_FINISHED_AT: step.finished_at,
                    ATTR_LAST_ERROR: step.error,
                    ATTR_CURRENT_ATTEMPT: step.current_attempt,
                    CONF_DEPENDS_ON: list(step.definition.get(CONF_DEPENDS_ON, [])),
                    CONF_PARALLEL_MODE: step.definition.get(CONF_PARALLEL_MODE),
                    ATTR_TARGETS: target_dicts,
                    "is_desired": step_current_status == STATUS_SUCCESS,
                }
            )

        enabled = all(step["is_desired"] for step in steps) if steps else False
        return {
            ATTR_MODE_ID: runtime.mode_id,
            ATTR_MODE_NAME: runtime.definition.get(
                CONF_NAME, runtime.mode_id.replace("_", " ").title()
            ),
            ATTR_DESCRIPTION: runtime.definition.get(CONF_DESCRIPTION, ""),
            CONF_ICON: runtime.definition.get(CONF_ICON, DEFAULT_ICON),
            ATTR_STATUS: runtime.status,
            ATTR_LAST_RUN_STATUS: runtime.status,
            ATTR_ENABLED: enabled,
            ATTR_STARTED_AT: runtime.started_at,
            ATTR_FINISHED_AT: runtime.finished_at,
            ATTR_LAST_ERROR: runtime.last_error,
            ATTR_RUNNING_STEPS: [
                step_id
                for step_id, step in runtime.step_runtimes.items()
                if step.status == STATUS_RUNNING
            ],
            ATTR_FAILED_STEPS: [
                step_id
                for step_id, step in runtime.step_runtimes.items()
                if step.status in (STATUS_FAILED, STATUS_PARTIAL, STATUS_SKIPPED)
            ],
            ATTR_SUCCESSFUL_STEPS: [
                step_id
                for step_id, step in runtime.step_runtimes.items()
                if step.status == STATUS_SUCCESS
            ],
            ATTR_STEPS: steps,
        }

    async def async_reset_mode(self, mode_id: str) -> None:
        """Reset a mode to idle."""
        if self.is_running(mode_id):
            raise HomeAssistantError(f"Mode '{mode_id}' is currently running")
        self.runtimes[mode_id].reset()
        self._notify(mode_id)

    async def async_run_mode(self, mode_id: str) -> None:
        """Start a mode run in the background."""
        if not self.mode_exists(mode_id):
            raise HomeAssistantError(f"Unknown mode '{mode_id}'")
        if self.is_running(mode_id):
            return
        task = self.hass.async_create_task(self._async_execute_mode(mode_id))
        self._tasks[mode_id] = task

    async def async_run_action(
        self, mode_id: str, step_id: str, target_entity_id: str | None = None
    ) -> None:
        """Run one step or target, including its dependencies."""
        if not self.mode_exists(mode_id):
            raise HomeAssistantError(f"Unknown mode '{mode_id}'")
        if self.is_running(mode_id):
            raise HomeAssistantError(f"Mode '{mode_id}' is already running")

        runtime = self.runtimes[mode_id]
        if step_id not in runtime.step_runtimes:
            raise HomeAssistantError(f"Unknown step '{step_id}'")

        selected_steps = self._step_dependency_closure(runtime, step_id)
        target_filters = {step_id: target_entity_id} if target_entity_id else {}
        task = self.hass.async_create_task(
            self._async_execute_mode(
                mode_id,
                selected_steps=selected_steps,
                target_filters=target_filters,
            )
        )
        self._tasks[mode_id] = task

    def _step_dependency_closure(self, runtime: ModeRuntime, step_id: str) -> set[str]:
        """Return a step plus its recursive dependencies."""
        remaining = [step_id]
        selected: set[str] = set()
        while remaining:
            current = remaining.pop()
            if current in selected:
                continue
            selected.add(current)
            remaining.extend(
                runtime.step_runtimes[current].definition.get(CONF_DEPENDS_ON, [])
            )
        return selected

    async def _async_execute_mode(
        self,
        mode_id: str,
        selected_steps: set[str] | None = None,
        target_filters: dict[str, str] | None = None,
    ) -> None:
        """Execute a mode with dependency-aware parallel scheduling."""
        runtime = self.runtimes[mode_id]
        runtime.reset()
        runtime.status = STATUS_RUNNING
        runtime.started_at = _utcnow()
        self._notify(mode_id)

        pending = set(selected_steps or runtime.step_runtimes)
        running: dict[str, asyncio.Task[str]] = {}
        completed: dict[str, str] = {}
        target_filters = target_filters or {}

        try:
            while pending or running:
                self._mark_blocked_steps(runtime, pending, completed)

                ready = [
                    step_id
                    for step_id in pending
                    if all(
                        completed.get(dep) == STATUS_SUCCESS
                        for dep in runtime.step_runtimes[step_id].definition.get(
                            CONF_DEPENDS_ON, []
                        )
                    )
                ]

                for step_id in ready:
                    pending.remove(step_id)
                    running[step_id] = self.hass.async_create_task(
                        self._async_execute_step(
                            runtime,
                            step_id,
                            only_target_entity_id=target_filters.get(step_id),
                        )
                    )

                if not running:
                    if pending:
                        for step_id in list(pending):
                            step_runtime = runtime.step_runtimes[step_id]
                            step_runtime.status = STATUS_SKIPPED
                            step_runtime.error = (
                                "Step could not start because dependencies were unresolved"
                            )
                            step_runtime.finished_at = _utcnow()
                            completed[step_id] = STATUS_SKIPPED
                            pending.remove(step_id)
                        self._notify(mode_id)
                    break

                done, _pending = await asyncio.wait(
                    running.values(), return_when=asyncio.FIRST_COMPLETED
                )

                for task in done:
                    finished_step_id = next(
                        step_id
                        for step_id, running_task in list(running.items())
                        if running_task == task
                    )
                    completed[finished_step_id] = task.result()
                    del running[finished_step_id]

            statuses = {
                runtime.step_runtimes[step_id].status
                for step_id in (selected_steps or runtime.step_runtimes.keys())
            }
            if statuses == {STATUS_SUCCESS}:
                runtime.status = STATUS_SUCCESS
            elif STATUS_FAILED in statuses or STATUS_PARTIAL in statuses:
                runtime.status = STATUS_PARTIAL
            elif STATUS_SKIPPED in statuses:
                runtime.status = STATUS_FAILED
            else:
                runtime.status = STATUS_SUCCESS
        except Exception as err:  # pragma: no cover - defensive guard
            runtime.status = STATUS_FAILED
            runtime.last_error = str(err)
        finally:
            runtime.finished_at = _utcnow()
            self._notify(mode_id)
            self._tasks.pop(mode_id, None)

    def _mark_blocked_steps(
        self, runtime: ModeRuntime, pending: set[str], completed: dict[str, str]
    ) -> None:
        """Skip pending steps whose dependencies already failed."""
        changed = False
        for step_id in list(pending):
            dependencies = runtime.step_runtimes[step_id].definition.get(CONF_DEPENDS_ON, [])
            if any(
                completed.get(dep) in (STATUS_FAILED, STATUS_PARTIAL, STATUS_SKIPPED)
                for dep in dependencies
            ):
                step_runtime = runtime.step_runtimes[step_id]
                step_runtime.status = STATUS_SKIPPED
                step_runtime.error = "Skipped because a dependency failed"
                step_runtime.finished_at = _utcnow()
                completed[step_id] = STATUS_SKIPPED
                pending.remove(step_id)
                changed = True
        if changed:
            self._notify(runtime.mode_id)

    async def _async_execute_step(
        self,
        runtime: ModeRuntime,
        step_id: str,
        only_target_entity_id: str | None = None,
    ) -> str:
        """Execute one step, optionally in parallel per target."""
        step_runtime = runtime.step_runtimes[step_id]
        step_definition = step_runtime.definition
        step_runtime.status = STATUS_RUNNING
        step_runtime.started_at = _utcnow()
        step_runtime.error = None
        self._notify(runtime.mode_id)

        targets = step_runtime.targets
        if not targets:
            target = StepTargetRuntime({})
            step_runtime.targets = [target]
            targets = step_runtime.targets

        if only_target_entity_id is not None:
            targets = [
                target
                for target in targets
                if target.data.get("entity_id") == only_target_entity_id
            ]
            if not targets:
                raise HomeAssistantError(
                    f"Unknown target '{only_target_entity_id}' for step '{step_id}'"
                )

        if step_definition.get(CONF_PARALLEL_MODE) == PARALLEL_MODE_SEQUENTIAL:
            target_statuses = []
            for target_runtime in targets:
                target_statuses.append(
                    await self._async_execute_target(
                        runtime.mode_id, step_runtime, target_runtime
                    )
                )
        else:
            target_tasks = [
                self.hass.async_create_task(
                    self._async_execute_target(runtime.mode_id, step_runtime, target_runtime)
                )
                for target_runtime in targets
            ]
            target_statuses = list(await asyncio.gather(*target_tasks))

        successes = target_statuses.count(STATUS_SUCCESS)
        failures = len(target_statuses) - successes

        if failures == 0:
            step_runtime.status = STATUS_SUCCESS
        elif successes == 0:
            step_runtime.status = STATUS_FAILED
            if not step_runtime.error:
                step_runtime.error = "All targets failed"
        else:
            step_runtime.status = STATUS_PARTIAL
            if not step_runtime.error:
                step_runtime.error = "Some targets failed"

        step_runtime.finished_at = _utcnow()
        if step_runtime.status in (STATUS_FAILED, STATUS_PARTIAL):
            runtime.last_error = step_runtime.error
        self._notify(runtime.mode_id)
        return step_runtime.status

    async def _async_execute_target(
        self,
        mode_id: str,
        step_runtime: StepRuntime,
        target_runtime: StepTargetRuntime,
    ) -> str:
        """Execute one target within a step."""
        max_attempts = step_runtime.definition.get(CONF_RETRY, DEFAULT_RETRY) + 1
        target_runtime.status = STATUS_RUNNING
        target_runtime.started_at = _utcnow()
        self._notify(mode_id)

        for attempt in range(1, max_attempts + 1):
            step_runtime.current_attempt = attempt
            target_runtime.attempts = attempt
            context = {**target_runtime.data, "attempt": attempt}

            try:
                await self._async_call_step_service(step_runtime.definition, context)
                verified = await self._async_verify(step_runtime.definition, context)
                if verified:
                    target_runtime.status = STATUS_SUCCESS
                    target_runtime.finished_at = _utcnow()
                    target_runtime.error = None
                    self._notify(mode_id)
                    return STATUS_SUCCESS
            except Exception as err:  # pragma: no cover - service errors are runtime-dependent
                target_runtime.error = str(err)
                step_runtime.error = str(err)

        target_runtime.status = STATUS_FAILED
        target_runtime.finished_at = _utcnow()
        target_runtime.error = target_runtime.error or "Verification timed out"
        step_runtime.error = target_runtime.error
        self._notify(mode_id)
        return STATUS_FAILED

    async def _async_call_step_service(
        self, step_definition: dict[str, Any], context: dict[str, Any]
    ) -> None:
        """Call the Home Assistant service for a step."""
        domain, service = step_definition[CONF_SERVICE].split(".", 1)
        data = _render_template_value(step_definition.get(CONF_SERVICE_DATA, {}), context)
        if "entity_id" in context:
            data = {**_service_target_data(context), **data}
        await self.hass.services.async_call(domain, service, data, blocking=True)

    async def _async_verify(
        self, step_definition: dict[str, Any], context: dict[str, Any]
    ) -> bool:
        """Verify a target result until timeout."""
        verify = step_definition.get(CONF_VERIFY, {})
        verify_type = verify.get("type", VERIFY_TYPE_NONE)
        if verify_type == VERIFY_TYPE_NONE:
            return True

        timeout = float(step_definition.get(CONF_TIMEOUT, DEFAULT_TIMEOUT))
        end_time = self.hass.loop.time() + timeout

        while self.hass.loop.time() < end_time:
            if self._check_verify_condition(verify, context):
                return True
            await asyncio.sleep(DEFAULT_POLL_INTERVAL)
        return False

    def _check_verify_condition(self, verify: dict[str, Any], context: dict[str, Any]) -> bool:
        """Evaluate a verification block."""
        entity_id = _render_template_value(verify.get("entity_id"), context)
        if not entity_id:
            return True

        state = self.hass.states.get(entity_id)
        if state is None:
            return False

        verify_type = verify.get("type", VERIFY_TYPE_NONE)
        expected_value = _render_template_value(verify.get("value"), context)

        if verify_type == VERIFY_TYPE_STATE:
            return state.state == str(expected_value)

        if verify_type == VERIFY_TYPE_ATTRIBUTE:
            attribute = verify.get("attribute")
            return state.attributes.get(attribute) == expected_value

        return True


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up room modes from YAML."""
    domain_config = config.get(DOMAIN)
    if domain_config is None:
        return True

    manager = RoomModeManager(hass, domain_config)
    hass.data.setdefault(DOMAIN, {})["manager"] = manager

    async def async_run_mode(call: ServiceCall) -> None:
        await manager.async_run_mode(call.data["mode"])

    async def async_reset_mode(call: ServiceCall) -> None:
        await manager.async_reset_mode(call.data["mode"])

    async def async_run_action(call: ServiceCall) -> None:
        await manager.async_run_action(
            call.data["mode"],
            call.data["step"],
            call.data.get("target_entity_id"),
        )

    hass.services.async_register(
        DOMAIN, SERVICE_RUN_MODE, async_run_mode, schema=SERVICE_RUN_MODE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_RESET_MODE, async_reset_mode, schema=SERVICE_RESET_MODE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_RUN_ACTION, async_run_action, schema=SERVICE_RUN_ACTION_SCHEMA
    )

    await discovery.async_load_platform(hass, Platform.SENSOR, DOMAIN, {}, config)
    return True
