# 象棋引擎（Pikafish）的下载和配置

请将下载并解压后的 Pikafish 引擎文件放置于此目录。

1. 选择适合您 CPU 的版本（推荐 pikafish-avx2.exe）。
2. 将其重命名为 pikafish.exe。
3. 确保文件路径为：resources\bin\pikafish.exe
4. 确保目录中存在神经网络文件 pikafish.nnue。如果缺失，请从 https://github.com/official-pikafish/Networks/releases/download/master-net/pikafish.nnue 下载。

之后重新运行 npm run dev 即可启动带有 AI 功能的象棋助手。


## 象棋引擎（Pikafish）的参数：

```ml
Pikafish 2026-01-02 by the Pikafish developers (see AUTHORS file)
uci
id name Pikafish 2026-01-02
id author the Pikafish developers (see AUTHORS file)

option name Debug Log File type string default <empty>
option name NumaPolicy type string default auto
option name MultiPV type spin default 1 min 1 max 128
option name Move Overhead type spin default 10 min 0 max 5000     
option name nodestime type spin default 0 min 0 max 10000
option name UCI_ShowWDL type check default false
option name EvalFile type string default pikafish.nnue
uciok
```

通过 UCI (Universal Chess Interface) 协议暴露出来的配置参数。它们允许用户或界面（GUI）调整引擎的行为。

以下是各个参数的详细解释：

1. MultiPV (重要)
   
   - 含义 : 多重最善着法 (Multiple Principal Variations)。
   - 作用 : 设置引擎同时计算并显示几个最好的走法。默认是 1 （只计算最好的一步）。
   - 当前应用 : 我们刚才在代码中将其设置为 3 ，这样引擎就会告诉我们前三步最好的棋分别是哪里，以及它们的评分差距。
2. Threads
   
   - 含义 : 线程数。
   - 作用 : 指定引擎可以使用多少个 CPU 核心进行并行计算。数值越高，计算速度越快（棋力越强），但会占用更多系统资源。
3. Hash
   
   - 含义 : 哈希表大小（以 MB 为单位）。
   - 作用 : 也就是“置换表”的大小。引擎会把计算过的局面存入内存，如果下次遇到相同或相似局面，直接读取结果而不用重新计算。内存越大，引擎“记性”越好，棋力通常越强。
4. Ponder
   
   - 含义 : 后台思考（或称“想棋”）。
   - 作用 : 如果开启（ true ），当轮到对手（或人类）思考时，引擎不会闲着，而是会猜测对手可能走什么，并针对性地进行预先计算。如果猜对了，引擎回应会非常快。
5. EvalFile
   
   - 含义 : 评估文件。
   - 作用 : 指定神经网络文件（NNUE）的路径（如 pikafish.nnue ）。这是引擎的大脑核心，包含了所有的评估知识。如果没有这个文件，引擎就像失去了判断力。
6. UCI_ShowWDL
   
   - 含义 : 显示胜/平/负概率 (Win/Draw/Loss)。
   - 作用 : 如果开启，引擎除了给出一个分数（如 +100 ），还会估算具体的胜率（例如：胜率 40%，和率 50%，负率 10%）。
7. Move Overhead
   
   - 含义 : 走棋时间缓冲（毫秒）。
   - 作用 : 为了防止网络延迟或界面卡顿导致引擎“超时判负”，引擎会在计算时间时预留出这部分时间（例如预留 10ms 不用满）。
8. NumaPolicy
   
   - 含义 : 非一致性内存访问策略。
   - 作用 : 主要针对服务器或高端多路 CPU 电脑。设置如何分配内存以提高访问速度。普通家用电脑通常选 auto 即可。
9. Clear Hash
   
   - 含义 : 清空哈希表。
   - 作用 : 一个按钮型命令，手动清除之前记忆的所有局面信息。
10. Debug Log File
    
    - 含义 : 调试日志文件。
    - 作用 : 指定一个文件路径，引擎会把运行时的内部详细日志写进去，用于排查故障。
11. nodestime
    
    - 含义 : 节点时间策略。
    - 作用 : 这是一个高级调试参数，通常用于引擎开发测试，让引擎根据计算的“节点数”而不是“时间”来决定何时停止，以保证测试结果的一致性。

总结 对于普通用户或开发这个应用来说，最需要关注的是 MultiPV （用于显示多步建议）、 Threads （调整性能）和 Hash （调整内存占用）。 EvalFile 必须确保存在且正确加载，否则引擎无法工作。