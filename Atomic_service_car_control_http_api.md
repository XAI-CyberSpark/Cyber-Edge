# Car Control HTTP API Specification（最下面有中文版）

## Overview

An HTTP server running on the Android head unit that exposes Atomic servicce car control APIs (seat, light, vehicle controls) over HTTP. The server listens on **port 8080** and accepts JSON requests.

Base URL: `http://<device-ip>:8080`

## Endpoints

### POST /api/vehicle/control

The main endpoint for all car control operations. The request body specifies which module, function, and parameters to use.

### GET /api/vehicle/signals

Returns a list of all available signal keys, their descriptions, supported functions, and set parameter ranges. No request body required.

***

## Request Format

```
POST /api/vehicle/control
Content-Type: application/json
```

```json
{
  "module": "<module_name>",
  "function": "<function_name>",
  "params": {
    "signalKey": "<signal_key>",
    ...additional params depending on module and function
  }
}
```

### Fields

| Field              | Type   | Required                               | Description                                     |
| ------------------ | ------ | -------------------------------------- | ----------------------------------------------- |
| `module`           | string | Yes                                    | One of: `seat`, `light`, `vehicleControl`       |
| `function`         | string | Yes                                    | One of: `subscribe`, `get`, `set`               |
| `params.signalKey` | string | Yes                                    | The signal identifier (see Signal Keys section) |
| `params.level`     | int    | For `set` on seat/light                | The level value to set                          |
| `params.area`      | int    | For `set` on vehicleControl (optional) | The area/zone to control                        |
| `params.status`    | int    | For `set` on vehicleControl            | The status value to set                         |

***

## Response Format

### Success Response

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

### Error Response

```json
{
  "code": -1,
  "message": "error description",
  "data": null
}
```

### Data Object (for `get` function)

```json
{
  "signalName": "SEAT_HEAT_STATUS_0",
  "signalValue": "AtomicAbility(...)",
  "signalParsedValue": "2",
  "sourceOfValue": "AtmoicService",
  "updateTs": 1713700000000
}
```

### Data Object (for `set` function)

```json
{
  "response": "AtomicAbility(...)"
}
```

***

## Modules and Functions

### seat

Controls seat heating, seat ventilation, and reads seat occupation status.

**Functions:**

- `subscribe` - Subscribe to signal change events
- `get` - Get current signal value (async)
- `set` - Set signal value (requires `level` param)

**Set Parameters:**

- `level` (int, required): The level to set

### light

Controls ambient light effects and single color.

**Functions:**

- `subscribe` - Subscribe to signal change events
- `get` - Get current signal value (async)
- `set` - Set signal value (requires `level` param)

**Set Parameters:**

- `level` (int, required): The level to set

### vehicleControl

Controls windows, sunshades, and reads temperature sensors.

**Functions:**

- `subscribe` - Subscribe to signal change events
- `get` - Get current signal value (async)
- `set` - Set signal value (requires `area` and `status` params)

**Set Parameters:**

- `area` (int, optional): The area/zone to control. Defaults vary by signal type.
- `status` (int, required): The status value to set

***

## Signal Keys Reference

### seat Signals

| Signal Key                                                | Description                  | Functions           | Set Params           |
| --------------------------------------------------------- | ---------------------------- | ------------------- | -------------------- |
| `SEAT_HEAT_STATUS_0`                                      | Driver seat heating          | subscribe, get, set | `level`: 0-3 (0=off) |
| `SEAT_HEAT_STATUS_1`                                      | Passenger seat heating       | subscribe, get, set | `level`: 0-3         |
| `SEAT_HEAT_STATUS_2`                                      | Rear left seat heating       | subscribe, get, set | `level`: 0-3         |
| `SEAT_HEAT_STATUS_3`                                      | Rear right seat heating      | subscribe, get, set | `level`: 0-3         |
| `SEAT_HEAT_STATUS`                                        | All seat heating (batch)     | subscribe, get, set | `level`: 0-3         |
| `SEAT_VENTILATION_STATUS_0`                               | Driver seat ventilation      | subscribe, get, set | `level`: 0-3 (0=off) |
| `SEAT_VENTILATION_STATUS_1`                               | Passenger seat ventilation   | subscribe, get, set | `level`: 0-3         |
| `SEAT_VENTILATION_STATUS_2`                               | Rear left seat ventilation   | subscribe, get, set | `level`: 0-3         |
| `SEAT_VENTILATION_STATUS_3`                               | Rear right seat ventilation  | subscribe, get, set | `level`: 0-3         |
| `SEAT_VENTILATION_STATUS`                                 | All seat ventilation (batch) | subscribe, get, set | `level`: 0-3         |
| `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_0` | Driver seat occupation       | subscribe, get      | read-only            |
| `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_1` | Passenger seat occupation    | subscribe, get      | read-only            |
| `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_2` | Rear left seat occupation    | subscribe, get      | read-only            |
| `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_3` | Rear right seat occupation   | subscribe, get      | read-only            |

### light Signals

| Signal Key                                   | Description                       | Functions           | Set Params    |
| -------------------------------------------- | --------------------------------- | ------------------- | ------------- |
| `AMBIENCE_LIGHT_EFFECT_OPERATIONAL_FEEDBACK` | Operational feedback light effect | subscribe, get, set | `level`: 0-3  |
| `AMBIENCE_LIGHT_EFFECT_WARNING_AID`          | Warning aid light effect          | subscribe, get, set | `level`: 0-3  |
| `AMBIENCE_LIGHT_EFFECT_DYNAMIC_MULTICOLORE`  | Dynamic multicolor light effect   | subscribe, get, set | `level`: 0-3  |
| `AMBIENCE_LIGHT_SINGLE_COLOR`                | Single color ambient light        | get, set            | `level`: 1-64 |

### vehicleControl Signals

| Signal Key              | Description                 | Functions           | Set Params                   |
| ----------------------- | --------------------------- | ------------------- | ---------------------------- |
| `AIR_TEMP_OUTSIDE`      | Outside temperature         | subscribe, get      | read-only                    |
| `AIR_TEMP_INSIDE`       | Inside temperature          | subscribe, get      | read-only                    |
| `WINDOW_POSITION`       | Window position control     | subscribe, get, set | `area`: 0-6, `status`: 0-100 |
| `SUNSHADE_SLIDING_OPEN` | Sunshade open/close control | get, set            | `area`: 1-4, `status`: 0-1   |

#### Window Area Values

| Value | Description           |
| ----- | --------------------- |
| 0     | All windows (default) |
| 1     | Driver                |
| 2     | Co-driver (passenger) |
| 3     | Rear left             |
| 4     | Rear right            |
| 5     | Front row             |
| 6     | Rear row              |

#### Window Status Values

- `0` = Fully closed
- `100` = Fully open
- Granularity: multiples of 10 (0, 10, 20, ..., 100)

#### Sunshade Area Values

| Value | Description                |
| ----- | -------------------------- |
| 1     | Sunroof sunshade (default) |
| 2     | Rear windshield sunshade   |
| 3     | Rear left                  |
| 4     | Rear right                 |

#### Sunshade Status Values

- `0` = Closed
- `1` = Open

***

## Examples

### 1. Get driver seat heating level

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "seat",
    "function": "get",
    "params": {
      "signalKey": "SEAT_HEAT_STATUS_0"
    }
  }'
```

Response:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "signalName": "SEAT_HEAT_STATUS_0",
    "signalValue": "AtomicAbility(...)",
    "signalParsedValue": "2",
    "sourceOfValue": "AtmoicService",
    "updateTs": 1713700000000
  }
}
```

### 2. Set driver seat heating to level 3

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "seat",
    "function": "set",
    "params": {
      "signalKey": "SEAT_HEAT_STATUS_0",
      "level": 3
    }
  }'
```

Response:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "response": "AtomicAbility(...)"
  }
}
```

### 3. Subscribe to passenger seat ventilation

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "seat",
    "function": "subscribe",
    "params": {
      "signalKey": "SEAT_VENTILATION_STATUS_1"
    }
  }'
```

Response:

```json
{
  "code": 0,
  "message": "Subscribed to SEAT_VENTILATION_STATUS_1",
  "data": null
}
```

### 4. Set ambient light to single color (value 32)

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "light",
    "function": "set",
    "params": {
      "signalKey": "AMBIENCE_LIGHT_SINGLE_COLOR",
      "level": 32
    }
  }'
```

### 5. Get outside temperature

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "vehicleControl",
    "function": "get",
    "params": {
      "signalKey": "AIR_TEMP_OUTSIDE"
    }
  }'
```

### 6. Open driver window (100%)

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "vehicleControl",
    "function": "set",
    "params": {
      "signalKey": "WINDOW_POSITION",
      "area": 1,
      "status": 100
    }
  }'
```

### 7. Close all windows

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "vehicleControl",
    "function": "set",
    "params": {
      "signalKey": "WINDOW_POSITION",
      "area": 0,
      "status": 0
    }
  }'
```

### 8. Open sunroof sunshade

```bash
curl -X POST http://<device-ip>:8080/api/vehicle/control \
  -H "Content-Type: application/json" \
  -d '{
    "module": "vehicleControl",
    "function": "set",
    "params": {
      "signalKey": "SUNSHADE_SLIDING_OPEN",
      "area": 1,
      "status": 1
    }
  }'
```

### 9. List all available signals

```bash
curl http://<device-ip>:8080/api/vehicle/signals
```

***

## Error Codes

| HTTP Status | Code | Description                                                         |
| ----------- | ---- | ------------------------------------------------------------------- |
| 200         | 0    | Success                                                             |
| 200         | -1   | Business logic error (e.g., failed to get data, read-only signal)   |
| 400         | -1   | Bad request (invalid JSON, missing fields, unknown module/function) |
| 404         | -1   | Endpoint not found                                                  |
| 500         | -1   | Internal server error                                               |

## Notes

- The server starts automatically when `CarControlTestActivity` is created and stops when the activity is destroyed.
- Set operations have a **10-second timeout**. If the underlying atomic ability does not respond within this time, the request returns a timeout error.
- Subscribe operations are fire-and-forget: the server returns immediately after initiating the subscription. Subscription data flows internally and is not pushed over HTTP.
- CORS headers are included to allow browser-based clients.
- The server handles one connection at a time per coroutine; multiple concurrent requests are supported via Kotlin coroutines.

***

## 中文整理表

下面按“可读/可写/参数范围/适合什么自然语言指令”对奔驰提供的车控接口做一份中文整理，便于编排节点和提示词设计时直接参考。

说明：

- `可读`：表示支持 `get` 或 `subscribe`
- `可写`：表示支持 `set`
- `参数范围`：仅列出 `set` 时需要关注的参数
- `适合自然语言指令`：是推荐示例，不是唯一表达方式

| 模块             | Signal Key                                                | 中文说明      | 可读 | 可写 | 参数范围                                | 适合自然语言指令                         |
| -------------- | --------------------------------------------------------- | --------- | -- | -- | ----------------------------------- | -------------------------------- |
| seat           | `SEAT_HEAT_STATUS_0`                                      | 主驾座椅加热    | 是  | 是  | `level: 0-3`，`0=关闭`                 | 打开主驾座椅加热；主驾座椅加热调到3档；查询主驾座椅加热     |
| seat           | `SEAT_HEAT_STATUS_1`                                      | 副驾座椅加热    | 是  | 是  | `level: 0-3`                        | 打开副驾座椅加热；副驾座椅加热调到2档；查询副驾座椅加热     |
| seat           | `SEAT_HEAT_STATUS_2`                                      | 左后座椅加热    | 是  | 是  | `level: 0-3`                        | 打开左后座椅加热；左后座椅加热调到1档；查询左后座椅加热     |
| seat           | `SEAT_HEAT_STATUS_3`                                      | 右后座椅加热    | 是  | 是  | `level: 0-3`                        | 打开右后座椅加热；右后座椅加热调到3档；查询右后座椅加热     |
| seat           | `SEAT_HEAT_STATUS`                                        | 全部座椅加热    | 是  | 是  | `level: 0-3`                        | 打开全部座椅加热；把所有座椅加热调到最高档；关闭全部座椅加热   |
| seat           | `SEAT_VENTILATION_STATUS_0`                               | 主驾座椅通风    | 是  | 是  | `level: 0-3`，`0=关闭`                 | 打开主驾座椅通风；主驾座椅通风调到2档；查询主驾座椅通风     |
| seat           | `SEAT_VENTILATION_STATUS_1`                               | 副驾座椅通风    | 是  | 是  | `level: 0-3`                        | 打开副驾座椅通风；副驾座椅通风调到3档；查询副驾座椅通风     |
| seat           | `SEAT_VENTILATION_STATUS_2`                               | 左后座椅通风    | 是  | 是  | `level: 0-3`                        | 打开左后座椅通风；左后座椅通风调到1档；查询左后座椅通风     |
| seat           | `SEAT_VENTILATION_STATUS_3`                               | 右后座椅通风    | 是  | 是  | `level: 0-3`                        | 打开右后座椅通风；右后座椅通风调到2档；查询右后座椅通风     |
| seat           | `SEAT_VENTILATION_STATUS`                                 | 全部座椅通风    | 是  | 是  | `level: 0-3`                        | 打开全部座椅通风；把所有座椅通风调到最高档；关闭全部座椅通风   |
| seat           | `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_0` | 主驾占座状态    | 是  | 否  | 只读                                  | 查询主驾是否有人；订阅主驾占座状态                |
| seat           | `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_1` | 副驾占座状态    | 是  | 否  | 只读                                  | 查询副驾是否有人；订阅副驾占座状态                |
| seat           | `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_2` | 左后占座状态    | 是  | 否  | 只读                                  | 查询左后是否有人；订阅左后占座状态                |
| seat           | `SEAT_OCCUPATION_STATUS_CHANGED_SEAT_OCCUPATION_STATUS_3` | 右后占座状态    | 是  | 否  | 只读                                  | 查询右后是否有人；订阅右后占座状态                |
| light          | `AMBIENCE_LIGHT_EFFECT_OPERATIONAL_FEEDBACK`              | 操作反馈氛围灯效果 | 是  | 是  | `level: 0-3`                        | 打开操作反馈灯效；把操作反馈灯效调到3档；查询操作反馈灯效    |
| light          | `AMBIENCE_LIGHT_EFFECT_WARNING_AID`                       | 警示辅助氛围灯效果 | 是  | 是  | `level: 0-3`                        | 打开警示灯效；警示灯效调到最高档；查询警示灯效          |
| light          | `AMBIENCE_LIGHT_EFFECT_DYNAMIC_MULTICOLORE`               | 动态多彩氛围灯效果 | 是  | 是  | `level: 0-3`                        | 打开动态多彩氛围灯；动态灯效调到2档；查询动态灯效        |
| light          | `AMBIENCE_LIGHT_SINGLE_COLOR`                             | 单色氛围灯     | 是  | 是  | `level: 1-64`                       | 把氛围灯颜色调到32；设置单色氛围灯为64；查询当前单色氛围灯值 |
| vehicleControl | `AIR_TEMP_OUTSIDE`                                        | 车外温度      | 是  | 否  | 只读                                  | 查询车外温度；订阅外部温度变化                  |
| vehicleControl | `AIR_TEMP_INSIDE`                                         | 车内温度      | 是  | 否  | 只读                                  | 查询车内温度；订阅车内温度变化                  |
| vehicleControl | `WINDOW_POSITION`                                         | 车窗位置控制    | 是  | 是  | `area: 0-6`，`status: 0-100`，步进 `10` | 打开主驾车窗；关闭所有车窗；把副驾车窗开到50%；打开前排车窗  |
| vehicleControl | `SUNSHADE_SLIDING_OPEN`                                   | 遮阳帘开合控制   | 是  | 是  | `area: 1-4`，`status: 0-1`           | 打开天窗遮阳帘；关闭后挡遮阳帘；打开右后遮阳帘          |

### area / status 中文对照

#### `WINDOW_POSITION`

| 参数       | 取值      | 中文含义        |
| -------- | ------- | ----------- |
| `area`   | `0`     | 全部车窗        |
| `area`   | `1`     | 主驾          |
| `area`   | `2`     | 副驾          |
| `area`   | `3`     | 左后          |
| `area`   | `4`     | 右后          |
| `area`   | `5`     | 前排          |
| `area`   | `6`     | 后排          |
| `status` | `0`     | 全关          |
| `status` | `10-90` | 按 10 为步进的开度 |
| `status` | `100`   | 全开          |

#### `SUNSHADE_SLIDING_OPEN`

| 参数       | 取值  | 中文含义     |
| -------- | --- | -------- |
| `area`   | `1` | 天窗遮阳帘    |
| `area`   | `2` | 后挡风玻璃遮阳帘 |
| `area`   | `3` | 左后       |
| `area`   | `4` | 右后       |
| `status` | `0` | 关闭       |
| `status` | `1` | 打开       |

### 编排建议

- 需要“读状态/订阅变化”的节点，优先使用 `get` 或 `subscribe`
- 需要“执行控制”的节点，优先使用 `set`
- 座椅和灯光适合统一抽象成 `level`
- 车窗和遮阳帘适合统一抽象成 `area + status`
- 如果让 LLM 决策，提示词里最好直接说明：
  - `seat/light` 用 `level`
  - `WINDOW_POSITION` 用 `area + status`
  - `SUNSHADE_SLIDING_OPEN` 用 `area + status`

