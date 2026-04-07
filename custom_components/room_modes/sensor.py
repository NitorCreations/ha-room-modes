"""Sensor entities for room modes."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType
from homeassistant.util import slugify

from .const import ATTR_MODE_NAME, ATTR_STATUS, DOMAIN


async def async_setup_platform(
    hass: HomeAssistant,
    config: ConfigType,
    async_add_entities: AddEntitiesCallback,
    discovery_info: DiscoveryInfoType | None = None,
) -> None:
    """Set up room mode sensors."""
    manager = hass.data[DOMAIN]["manager"]
    async_add_entities([RoomModeSensor(manager, mode_id) for mode_id in manager.mode_ids])


class RoomModeSensor(SensorEntity):
    """Expose the latest room mode runtime state."""

    _attr_should_poll = False

    def __init__(self, manager, mode_id: str) -> None:
        self._manager = manager
        self._mode_id = mode_id
        snapshot = manager.async_get_snapshot(mode_id)
        self._attr_name = snapshot[ATTR_MODE_NAME]
        self._attr_unique_id = f"room_mode_{slugify(mode_id)}"
        self.entity_id = f"sensor.room_mode_{slugify(mode_id)}"
        self._attr_icon = manager.runtimes[mode_id].definition.get("icon")
        self._attr_native_value = snapshot[ATTR_STATUS]
        self._attr_extra_state_attributes = snapshot
        self._unsubscribe = None

    async def async_added_to_hass(self) -> None:
        """Subscribe to mode updates."""

        @callback
        def _handle_update() -> None:
            snapshot = self._manager.async_get_snapshot(self._mode_id)
            self._attr_native_value = snapshot[ATTR_STATUS]
            self._attr_extra_state_attributes = snapshot
            self._attr_name = snapshot[ATTR_MODE_NAME]
            self.async_write_ha_state()

        self._unsubscribe = self._manager.async_add_listener(self._mode_id, _handle_update)
        _handle_update()

    async def async_will_remove_from_hass(self) -> None:
        """Remove update listeners."""
        if self._unsubscribe is not None:
            self._unsubscribe()
