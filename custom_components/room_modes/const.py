"""Constants for the room modes integration."""

DOMAIN = "room_modes"

ATTR_CURRENT_ATTEMPT = "current_attempt"
ATTR_ENABLED = "enabled"
ATTR_DESCRIPTION = "description"
ATTR_FAILED_STEPS = "failed_steps"
ATTR_FINISHED_AT = "finished_at"
ATTR_LAST_RUN_STATUS = "last_run_status"
ATTR_LAST_ERROR = "last_error"
ATTR_MODE_ID = "mode_id"
ATTR_MODE_NAME = "mode_name"
ATTR_RUNNING_STEPS = "running_steps"
ATTR_STARTED_AT = "started_at"
ATTR_STATUS = "status"
ATTR_STEPS = "steps"
ATTR_SUCCESSFUL_STEPS = "successful_steps"
ATTR_TARGETS = "targets"

CONF_DEPENDS_ON = "depends_on"
CONF_DESCRIPTION = "description"
CONF_ICON = "icon"
CONF_ID = "id"
CONF_LABEL = "label"
CONF_NAME = "name"
CONF_PARALLEL_MODE = "parallel_mode"
CONF_RETRY = "retry"
CONF_SERVICE = "service"
CONF_SERVICE_DATA = "service_data"
CONF_STEPS = "steps"
CONF_TARGETS = "targets"
CONF_TIMEOUT = "timeout"
CONF_VERIFY = "verify"

DEFAULT_ICON = "mdi:button-cursor"
DEFAULT_POLL_INTERVAL = 0.5
DEFAULT_TIMEOUT = 30
DEFAULT_RETRY = 0

PARALLEL_MODE_PER_TARGET = "per_target"
PARALLEL_MODE_SEQUENTIAL = "sequential"

SERVICE_RUN_ACTION = "run_action"
SERVICE_RESET_MODE = "reset_mode"
SERVICE_RUN_MODE = "run_mode"

STATUS_FAILED = "failed"
STATUS_IDLE = "idle"
STATUS_NOT_ON = "not_on"
STATUS_PARTIAL = "partial"
STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_SKIPPED = "skipped"
STATUS_SUCCESS = "success"

VERIFY_TYPE_ATTRIBUTE = "attribute"
VERIFY_TYPE_NONE = "none"
VERIFY_TYPE_STATE = "state"
