import React, { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";

// 老虎机主题类型
type SlotTheme = "grandSlam" | "train" | "goldenBell";

// 符号类型
interface Symbol {
  id: string;
  emoji: string;
  name: string;
}

// 赔付线类型
interface Payline {
  name: string;
  indices: number[];
  multiplier: number;
}

// 主题配置
const themeConfigs: Record<
  SlotTheme,
  {
    name: string;
    symbols: Symbol[];
    paylines: Payline[];
    reels: number;
    rows: number;
    background: string;
  }
> = {
  grandSlam: {
    name: "大满贯 🎾",
    reels: 5,
    rows: 3,
    background: "linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%)",
    symbols: [
      { id: "tennis", emoji: "🎾", name: "网球" },
      { id: "trophy", emoji: "🏆", name: "奖杯" },
      { id: "medal", emoji: "🏅", name: "奖牌" },
      { id: "star", emoji: "⭐", name: "星星" },
      { id: "crown", emoji: "👑", name: "皇冠" },
      { id: "seven", emoji: "7️⃣", name: "七" },
      { id: "cherry", emoji: "🍒", name: "樱桃" },
      { id: "bar", emoji: " BAR ", name: "BAR" },
    ],
    paylines: [
      { name: "中轴线", indices: [1, 3, 5, 7, 9], multiplier: 3 },
      { name: "上线", indices: [0, 2, 4, 6, 8], multiplier: 2 },
      { name: "下线", indices: [2, 4, 6, 8, 10], multiplier: 2 },
      { name: "V线", indices: [2, 4, 4, 6, 8], multiplier: 4 },
      { name: "倒V线", indices: [0, 2, 2, 4, 6], multiplier: 4 },
    ],
  },
  train: {
    name: "开火车 🚂",
    reels: 5,
    rows: 3,
    background: "linear-gradient(135deg, #4a148c 0%, #6a1b9a 50%, #7b1fa2 100%)",
    symbols: [
      { id: "train", emoji: "🚂", name: "火车头" },
      { id: "locomotive", emoji: "🚃", name: "车厢" },
      { id: "railway", emoji: "🛤️", name: "铁轨" },
      { id: "station", emoji: "🏛️", name: "车站" },
      { id: "ticket", emoji: "🎫", name: "车票" },
      { id: "seven", emoji: "7️⃣", name: "七" },
      { id: "cherry", emoji: "🍒", name: "樱桃" },
      { id: "star", emoji: "⭐", name: "星星" },
    ],
    paylines: [
      { name: "中轴线", indices: [1, 3, 5, 7, 9], multiplier: 3 },
      { name: "上线", indices: [0, 2, 4, 6, 8], multiplier: 2 },
      { name: "下线", indices: [2, 4, 6, 8, 10], multiplier: 2 },
    ],
  },
  goldenBell: {
    name: "九莲宝灯 🔔",
    reels: 5,
    rows: 3,
    background: "linear-gradient(135deg, #e65100 0%, #ff8f00 50%, #ffb300 100%)",
    symbols: [
      { id: "bell", emoji: "🔔", name: "铃铛" },
      { id: "gold", emoji: "🪙", name: "金币" },
      { id: "diamond", emoji: "💎", name: "钻石" },
      { id: "gem", emoji: "💠", name: "宝石" },
      { id: "star", emoji: "⭐", name: "星星" },
      { id: "seven", emoji: "7️⃣", name: "七" },
      { id: "cherry", emoji: "🍒", name: "樱桃" },
      { id: "bar", emoji: " BAR ", name: "BAR" },
    ],
    paylines: [
      { name: "中轴线", indices: [1, 3, 5, 7, 9], multiplier: 3 },
      { name: "上线", indices: [0, 2, 4, 6, 8], multiplier: 2 },
      { name: "下线", indices: [2, 4, 6, 8, 10], multiplier: 2 },
      { name: "九莲1", indices: [0, 2, 4, 6, 8], multiplier: 9 },
      { name: "九莲2", indices: [0, 3, 4, 6, 9], multiplier: 9 },
    ],
  },
};

// 获奖结果类型
interface WinResult {
  payline: Payline;
  symbol: Symbol;
  count: number;
  win: number;
}

// 安全获取数组元素
function safeGet<T>(arr: T[], index: number, fallback: T): T {
  const item = arr[index];
  return item !== undefined ? item : fallback;
}

export const Component: React.FC = () => {
  const [theme, setTheme] = useState<SlotTheme>("goldenBell");
  const [reels, setReels] = useState<(Symbol | null)[][]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winResults, setWinResults] = useState<WinResult[]>([]);
  const [totalWin, setTotalWin] = useState(0);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [lastWin, setLastWin] = useState(0);
  const [message, setMessage] = useState("选择主题开始游戏！");
  const animationFrameRef = useRef<number | null>(null);

  const config = themeConfigs[theme];

  // 初始化转轴
  const initReels = useCallback(() => {
    const newReels: (Symbol | null)[][] = [];
    for (let i = 0; i < config.reels; i++) {
      const reelSymbols: (Symbol | null)[] = [];
      for (let j = 0; j < config.rows; j++) {
        const randomIndex = Math.floor(Math.random() * config.symbols.length);
        const randomSymbol = safeGet(config.symbols, randomIndex, config.symbols[0]!);
        reelSymbols.push(randomSymbol);
      }
      newReels.push(reelSymbols);
    }
    setReels(newReels);
  }, [config]);

  // 初始化
  useEffect(() => {
    initReels();
  }, [initReels]);

  // 生成随机符号
  const getRandomSymbol = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * config.symbols.length);
    return safeGet(config.symbols, randomIndex, config.symbols[0]!);
  }, [config.symbols]);

  // 旋转动画
  const spin = useCallback(() => {
    if (spinning || balance < bet) return;

    setSpinning(true);
    setWinResults([]);
    setTotalWin(0);
    setLastWin(0);
    setBalance((prev) => prev - bet);
    setMessage("旋转中...");

    // 创建新的转轴结果
    const newReels: (Symbol | null)[][] = [];
    const finalResults: Symbol[] = [];

    for (let i = 0; i < config.reels; i++) {
      const reelSymbols: (Symbol | null)[] = [];
      const finalSymbol = getRandomSymbol();
      finalResults.push(finalSymbol);

      // 旋转时显示随机符号
      for (let j = 0; j < config.rows; j++) {
        reelSymbols.push(getRandomSymbol());
      }
      newReels.push(reelSymbols);
    }

    // 动画时长和阶段
    const spinDuration = 2000; // 2秒
    const startTime = Date.now();
    const reelDelays = [0, 200, 400, 600, 800]; // 每列延迟停止

    const animate = () => {
      const elapsed = Date.now() - startTime;

      // 更新转轴显示
      const currentReels = newReels.map((reel, reelIndex) => {
        const delay = safeGet(reelDelays, reelIndex, 0);
        const reelElapsed = elapsed - delay;
        if (reelElapsed < 0) {
          // 还没开始这列的动画
          return reel.map(() => getRandomSymbol());
        }

        // 模拟旋转效果 - 随机更新符号
        if (reelElapsed < spinDuration - delay) {
          return reel.map(() => getRandomSymbol());
        }

        // 这列停止
        return reel.map((_, rowIndex) => {
          // 中间行显示最终结果
          if (rowIndex === 1) {
            return safeGet(finalResults, reelIndex, getRandomSymbol());
          }
          // 其他行显示一些随机符号营造氛围
          return getRandomSymbol();
        });
      });

      setReels(currentReels);

      // 检查是否还有列在旋转
      const allStopped = elapsed > spinDuration;
      if (!allStopped) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // 全部停止，计算结果
        setSpinning(false);
        calculateResults(finalResults);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [spinning, balance, bet, config, getRandomSymbol]);

  // 计算中奖结果
  const calculateResults = useCallback(
    (finalResults: Symbol[]) => {
      const flatResults = finalResults.flat();
      const wins: WinResult[] = [];

      for (const payline of config.paylines) {
        const lineSymbols = payline.indices.map((idx) => safeGet(flatResults, idx, null));
        const firstSymbol = lineSymbols[0];

        if (!firstSymbol) continue;

        // 检查是否全部相同
        const allSame = lineSymbols.every((s) => s?.id === firstSymbol.id);

        if (allSame && lineSymbols.length >= 3) {
          const win = bet * payline.multiplier * (lineSymbols.length - 2);
          wins.push({
            payline,
            symbol: firstSymbol,
            count: lineSymbols.length,
            win,
          });
        }
      }

      setWinResults(wins);
      const totalWinAmount = wins.reduce((sum, w) => sum + w.win, 0);
      setTotalWin(totalWinAmount);
      setBalance((prev) => prev + totalWinAmount);
      setLastWin(totalWinAmount);

      if (totalWinAmount > 0) {
        setMessage(`🎉 恭喜中奖！ +${totalWinAmount}`);
      } else {
        setMessage("未中奖，再试一次！");
      }
    },
    [config.paylines, bet]
  );

  // 切换主题
  const changeTheme = (newTheme: SlotTheme) => {
    if (spinning) return;
    setTheme(newTheme);
    setWinResults([]);
    setTotalWin(0);
    setMessage(`当前主题: ${themeConfigs[newTheme].name}`);
  };

  // 清理动画
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="slot-machine-container" style={{ background: config.background }}>
      {/* 主题选择 */}
      <div className="theme-selector">
        {(Object.keys(themeConfigs) as SlotTheme[]).map((t) => (
          <button
            key={t}
            className={`theme-btn ${theme === t ? "active" : ""}`}
            onClick={() => changeTheme(t)}
            disabled={spinning}
          >
            {themeConfigs[t].name}
          </button>
        ))}
      </div>

      {/* 游戏信息 */}
      <div className="game-info">
        <div className="balance">余额: 💰 {balance}</div>
        <div className="last-win">{lastWin > 0 ? `上次赢得: ${lastWin}` : ""}</div>
        <div className="message">{message}</div>
      </div>

      {/* 老虎机主体 */}
      <div className="slot-machine">
        <div className="reels-container">
          {reels.map((reel, reelIndex) => (
            <div key={reelIndex} className="reel">
              {reel.map((symbol, rowIndex) => (
                <div
                  key={`${reelIndex}-${rowIndex}`}
                  className={`reel-symbol ${rowIndex === 1 ? "middle-row" : ""} ${spinning ? "spinning" : ""}`}
                >
                  {symbol ? (
                    <span className="symbol-emoji">{symbol.emoji}</span>
                  ) : (
                    <span className="symbol-placeholder">?</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 赔付线指示器 */}
        <div className="paylines-indicator">
          {config.paylines.map((pl, idx) => (
            <div key={idx} className="payline-label">
              {pl.name} (x{pl.multiplier})
            </div>
          ))}
        </div>
      </div>

      {/* 中奖展示 */}
      {winResults.length > 0 && (
        <div className="win-display">
          <div className="win-title">🎰 中奖详情 🎰</div>
          {winResults.map((win, idx) => (
            <div key={idx} className="win-item">
              <span>
                {win.symbol.emoji} {win.payline.name} x{win.count}
              </span>
              <span className="win-amount">+{win.win}</span>
            </div>
          ))}
          <div className="total-win">总赢得: {totalWin}</div>
        </div>
      )}

      {/* 控制区 */}
      <div className="controls">
        <div className="bet-controls">
          <span className="bet-label">投注: </span>
          <button
            className="bet-btn"
            onClick={() => setBet((b) => Math.max(1, b - 10))}
            disabled={spinning || bet <= 1}
          >
            -10
          </button>
          <span className="bet-value">{bet}</span>
          <button
            className="bet-btn"
            onClick={() => setBet((b) => Math.min(balance, b + 10))}
            disabled={spinning || bet >= balance}
          >
            +10
          </button>
        </div>

        <button
          className={`spin-btn ${spinning ? "spinning" : ""}`}
          onClick={spin}
          disabled={spinning || balance < bet}
        >
          {spinning ? "旋转中..." : "开始旋转 🎰"}
        </button>

        <button
          className="add-credit-btn"
          onClick={() => setBalance((b) => b + 100)}
          disabled={spinning}
        >
          充值 💰
        </button>
      </div>

      {/* 赔付表 */}
      <div className="paytable">
        <div className="paytable-title">赔付表</div>
        <div className="paytable-grid">
          {config.symbols.map((sym) => (
            <div key={sym.id} className="paytable-item">
              <span className="paytable-emoji">{sym.emoji}</span>
              <span className="paytable-name">{sym.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};