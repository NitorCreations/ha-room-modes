# Room Modes for Home Assistant

A Home Assistant custom integration for orchestrating multi-step A/V and automation sequences. Define "room modes" that execute a series of steps with dependency tracking, parallel execution, verification, and retry logic.

Includes a companion Lovelace card (`room-mode-card`) for one-tap mode activation with real-time step status feedback.

## Installation

### HACS (recommended)

1. Add this repository as a custom repository in HACS
2. Install "Room Modes"
3. Restart Home Assistant
4. Add the frontend card resource (see [Frontend Card](#frontend-card))

### Manual

1. Copy `custom_components/room_modes/` to your `config/custom_components/` directory
2. Copy `custom_components/room_modes/room-mode-card.js` to your `config/www/` directory
3. Restart Home Assistant

## Configuration

Add your modes to `room_modes.yaml` in your config directory (or inline under `room_modes:` in `configuration.yaml`).

If using a separate file, add this to `configuration.yaml`:

```yaml
room_modes: !include room_modes.yaml
```

### Mode definition

```yaml
living_room_present:
  name: Living Room Present
  icon: mdi:presentation-play
  description: Present from the HDMI cable in the living room.
  steps:
    - id: ensure_tv_on
      label: TV power
      icon: mdi:power
      service: automation.trigger
      service_data:
        entity_id: automation.turn_on_living_room_tv
        skip_condition: true
      verify:
        type: state
        entity_id: media_player.living_room_tv
        value: "on"
      timeout: 40
      retry: 0

    - id: set_tv_hdmi1
      label: TV HDMI1
      icon: mdi:video-input-hdmi
      depends_on:
        - ensure_tv_on
      service: media_player.select_source
      service_data:
        entity_id: media_player.living_room_tv
        source: HDMI1
      verify:
        type: attribute
        entity_id: media_player.living_room_tv
        attribute: source
        value: HDMI1
      timeout: 20
      retry: 1

    - id: set_audio
      label: Audio HDMI
      icon: mdi:speaker
      service: media_player.select_source
      service_data:
        entity_id: media_player.audio_switch
        source: HDMI
      verify:
        type: attribute
        entity_id: media_player.audio_switch
        attribute: source
        value: HDMI
      timeout: 20
      retry: 1
```

### Step options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `id` | Yes | | Unique step identifier (slug) |
| `label` | Yes | | Human-readable step name |
| `icon` | No | `mdi:button-cursor` | MDI icon for the step |
| `service` | Yes | | Service to call (e.g. `media_player.select_source`) |
| `service_data` | No | `{}` | Data to pass to the service call |
| `depends_on` | No | `[]` | List of step IDs that must succeed before this step runs |
| `targets` | No | `[]` | List of entity IDs or `{entity_id: data}` maps for per-target execution |
| `verify` | No | | Verification condition (see below) |
| `timeout` | No | `30` | Timeout in seconds for verification |
| `retry` | No | `0` | Number of retry attempts on failure |
| `parallel_mode` | No | `per_target` | How targets execute: `per_target` (parallel) or `sequential` |

### Verification

Each step can verify its result before being marked as successful:

```yaml
verify:
  type: state          # "state" or "attribute"
  entity_id: media_player.my_tv
  value: "on"          # Expected state value
```

```yaml
verify:
  type: attribute
  entity_id: media_player.my_tv
  attribute: source
  value: HDMI1         # Expected attribute value
```

If verification is omitted or `type: none`, the step succeeds immediately after the service call.

### Dependencies

Steps can declare dependencies on other steps using `depends_on`. Independent steps run in parallel; dependent steps wait for their dependencies to succeed.

```yaml
steps:
  - id: power_on
    label: Power
    service: ...

  - id: select_input
    label: Input
    depends_on:
      - power_on       # Waits for power_on to succeed
    service: ...

  - id: set_audio
    label: Audio
    service: ...        # Runs in parallel with power_on
```

## Services

### `room_modes.run_mode`

Execute all steps of a mode.

| Field | Required | Description |
|-------|----------|-------------|
| `mode` | Yes | Mode ID (the top-level key in your config) |

### `room_modes.run_action`

Run a single step (and its dependencies) within a mode.

| Field | Required | Description |
|-------|----------|-------------|
| `mode` | Yes | Mode ID |
| `step` | Yes | Step ID to execute |
| `target_entity_id` | No | Specific target entity (for multi-target steps) |

### `room_modes.reset_mode`

Reset a mode sensor back to idle state.

| Field | Required | Description |
|-------|----------|-------------|
| `mode` | Yes | Mode ID |

## Sensors

Each mode creates a sensor entity: `sensor.room_mode_<mode_id>`

### States

| State | Description |
|-------|-------------|
| `idle` | Not running |
| `running` | Currently executing steps |
| `success` | All steps completed successfully |
| `partial` | Some steps succeeded, some failed |
| `failed` | Execution failed |

### Attributes

The sensor exposes detailed runtime state including per-step status, timing, attempt counts, and error messages.

## Frontend Card

The `room-mode-card` is a custom Lovelace card that provides one-tap mode activation with expandable step-level detail.

### Setup

Add the card as a Lovelace resource:

1. Go to **Settings > Dashboards > Resources**
2. Add `/local/room-mode-card.js` as a JavaScript Module

Or add to your Lovelace YAML:

```yaml
resources:
  - url: /local/room-mode-card.js
    type: module
```

### Usage

```yaml
type: custom:room-mode-card
entity: sensor.room_mode_living_room_present
title: Present    # Optional, overrides mode name
icon: mdi:presentation-play  # Optional, overrides mode icon
```

The card shows:
- Mode status with color coding (idle/ready, running, success, failed)
- Step icons with individual status indicators
- Expandable drawer with per-step detail and retry buttons
- One-tap to run the entire mode

## License

MIT
