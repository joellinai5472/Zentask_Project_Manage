import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "發生未知的錯誤。";
      let errorDetails = "";
      
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = "資料庫權限錯誤 (Firestore Permission Error)";
            errorDetails = `操作: ${parsed.operationType}\n路徑: ${parsed.path}\n錯誤: ${parsed.error}`;
          } else {
            errorMessage = this.state.error.message;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || "發生錯誤";
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center border border-red-100 dark:border-red-900/30">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
              {errorMessage}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              目前無法載入應用程式，請檢查您的權限或稍後再試。
            </p>
            {errorDetails && (
              <div className="text-left bg-slate-100 dark:bg-slate-900 p-4 rounded-lg overflow-auto text-xs font-mono text-slate-600 dark:text-slate-400 mb-6 whitespace-pre-wrap">
                {errorDetails}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              重新載入頁面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
