# 中国象棋辅助软件 - 技术架构文档

## 1. 技术栈选择

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **App Shell** | **Electron** | 提供跨平台桌面应用能力，Node.js 环境支持原生操作。 |
| **Frontend** | **React + TypeScript** | 构建现代化的响应式 UI。 |
| **Styling** | **Tailwind CSS** | 快速开发 UI 样式。 |
| **State Mgt** | **Zustand** | 轻量级状态管理，用于处理棋盘状态和设置。 |
| **Build Tool** | **Vite** | 高性能的前端构建工具。 |
| **Chess Logic** | **xiangqi.js (自研/适配)** | 前端负责基本的走法生成和合法性校验。 |
| **AI Engine** | **Pikafish (Stockfish)** | 通过 UCI 协议集成的外部可执行文件。 |
| **IPC** | **Electron IPC** | 主进程与渲染进程通信。 |

## 2. 系统架构

```mermaid
graph TD
    User[用户] --> UI[React 前端界面]
    
    subgraph "Renderer Process (前端)"
        UI --> BoardState[棋盘状态管理 (Zustand)]
        UI --> MoveValidator[着法校验逻辑]
        BoardState --> IPC_Renderer[IPC 通信层]
    end
    
    subgraph "Main Process (主进程)"
        IPC_Main[IPC 处理程序] --> EngineWrapper[UCI 引擎封装类]
        EngineWrapper --> |Spawn/StdIO| Pikafish[Pikafish.exe 进程]
        Pikafish --> |StdOut| EngineWrapper
    end
    
    IPC_Renderer <--> |JSON 消息| IPC_Main
```

## 3. 核心模块设计

### 3.1 UCI 引擎封装 (UCI Engine Wrapper)
位于主进程，负责管理 Pikafish 的生命周期和协议转换。

- **类名**: `UCIEngine`
- **主要方法**:
    - `start()`: 启动引擎进程。
    - `sendCmd(cmd: string)`: 发送 UCI 指令。
    - `quit()`: 关闭引擎。
    - `on('info', callback)`: 解析引擎输出的 `info` 行（分数、PV）。
    - `on('bestmove', callback)`: 接收引擎的最佳着法。
- **状态机**: `Uninitialized` -> `Ready` -> `Searching` -> `Pondering`。

### 3.2 前后端通信 (IPC API)

| 通道 (Channel) | 方向 | 数据 | 描述 |
| :--- | :--- | :--- | :--- |
| `engine:start` | Render->Main | `{ path }` | 启动引擎 |
| `engine:position` | Render->Main | `{ fen, moves }` | 发送当前局面 |
| `engine:go` | Render->Main | `{ options }` | 让引擎开始思考 |
| `engine:stop` | Render->Main | - | 停止思考 |
| `engine:info` | Main->Render | `{ score, depth, pv }` | 引擎思考信息更新 |
| `engine:bestmove` | Main->Render | `{ move }` | 引擎走子 |

### 3.3 目录结构规划

```
/
├── .trae/              # 文档
├── src/
│   ├── main/           # Electron 主进程代码
│   │   ├── main.ts
│   │   ├── uci-engine.ts  # 引擎封装
│   │   └── preload.ts
│   ├── renderer/       # React 前端代码
│   │   ├── components/ # 棋盘、棋子组件
│   │   ├── store/      # Zustand store
│   │   ├── lib/        # 象棋逻辑 (FEN解析等)
│   │   └── App.tsx
│   └── shared/         # 共享类型定义
├── resources/
│   └── bin/            # 存放 pikafish.exe
└── package.json
```

## 4. 第二阶段技术预研 (屏幕识别)

- **截屏**: 使用 Electron 的 `desktopCapturer` API 获取屏幕流，或调用系统原生截图工具。
- **图像处理**: 
    - 方案 A: `OpenCV.js` (WebAssembly) 在前端处理。
    - 方案 B: Python 子进程 (使用 OpenCV-Python) 处理复杂识别任务（如果 JS 性能不足）。
    - **流程**: 截图 -> 边缘检测找棋盘 -> 网格分割 -> 模板匹配/CNN 识别棋子 -> 生成 FEN。
```
