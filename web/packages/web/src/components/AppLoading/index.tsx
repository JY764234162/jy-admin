import "./styles.css";

export const AppLoading = () => (
  <div className="app-loading">
    <div className="app-loading__spinner" />
    <div className="app-loading__dots">
      <span className="app-loading__dot" />
      <span className="app-loading__dot" />
      <span className="app-loading__dot" />
    </div>
    <div className="app-loading__text">加载中...</div>
  </div>
);
