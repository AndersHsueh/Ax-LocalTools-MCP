# 🚀 MCP サーバー開発ガイド プロンプト

## 📋 タスク説明

ローカルファイル操作とコマンド実行機能を実装する完全なMCP（Model Context Protocol）サーバープロジェクトを作成してください。

## 🎯 コア機能要件

### 1. ファイル操作ツール
- **統一インターフェース**: `file_operation`という名前のツールを作成
- **サポート操作**: `read`（読み取り）、`write`（書き込み）、`list`（一覧）、`create_dir`（ディレクトリ作成）、`delete`（削除）
- **パラメータ構造**:
  ```json
  {
    "operation": "read|write|list|create_dir|delete",
    "path": "ファイルまたはディレクトリパス",
    "content": "書き込み内容（write操作のみ必要）"
  }
  ```

### 2. ファイル編集ツール (v1.1.0 新機能)
- **ツール名**: `file_edit`
- **サポート操作**: `delete_lines`（行削除）、`insert_lines`（行挿入）、`replace_lines`（行置換）、`append_lines`（行追加）
- **パラメータ構造**:
  ```json
  {
    "operation": "delete_lines|insert_lines|replace_lines|append_lines",
    "path": "ファイルパス",
    "start_line": "開始行番号（1から開始）",
    "end_line": "終了行番号（delete_linesとreplace_linesのみ必要）",
    "content": "挿入または置換する内容",
    "encoding": "ファイルエンコーディング（オプション、デフォルトutf8）"
  }
  ```

### 3. コマンド実行ツール
- **ツール名**: `execute_command`
- **パラメータ構造**:
  ```json
  {
    "command": "実行するコマンド",
    "working_directory": "作業ディレクトリ（オプション）"
  }
  ```

### 4. セキュリティ制限
- **禁止パス**: `/`, `/Users/<current_user>`, `/etc`, `/bin`
- **危険コマンドフィルタリング**: `rm -rf`, `sudo`, `chmod 777`, `format`, `del`など
- **パス検証**: すべての操作はセキュリティチェックを通過する必要があります

## 🛠️ 技術スタック要件

### 1. 開発環境
- **言語**: Node.js (>= 18.0.0)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **トランスポート**: stdio（標準入出力）
- **パッケージマネージャー**: npm

### 2. プロジェクト構造
```
mcp-server/
├── index.js              # メインサーバーファイル
├── package.json          # プロジェクト設定
├── mcp_config.json       # LM Studio設定
├── qwen_config.json      # Qwen設定
├── mcp_config_template.json # 設定テンプレート
└── README.md             # プロジェクトドキュメント
```

### 3. package.json要件
```json
{
  "name": "local-file-operation-mcp",
  "version": "1.0.0",
  "description": "ローカルファイル操作MCPサーバー",
  "main": "index.js",
  "bin": {
    "local-file-operation-mcp": "index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## 📋 設定要件

### 1. LM Studio設定
```json
{
  "mcpServers": {
    "file_operation": {
      "command": "/path/to/node",
      "args": ["/path/to/index.js"],
      "env": {
        "PATH": "/path/to/node/bin:/usr/local/bin:/usr/bin:/bin",
        "NODE_PATH": "/path/to/project"
      }
    }
  }
}
```

### 2. Qwen設定
```json
{
  "mcpServers": {
    "file_operation": {
      "command": "npx",
      "args": [
        "-y",
        "local-file-operation-mcp@file:/path/to/project"
      ]
    }
  }
}
```

## 🔧 実装要件

### 1. MCPサーバー実装
- `@modelcontextprotocol/sdk`を使用してサーバーを作成
- `ListToolsRequestSchema`を実装してツールリストを返す
- `CallToolRequestSchema`を実装してツール呼び出しを処理
- `stdio`トランスポート方式を使用

### 2. ツール実装詳細
- **ファイル読み取り**: `fs.readFileSync`または`fs.promises.readFile`を使用
- **ファイル書き込み**: `fs.writeFileSync`または`fs.promises.writeFile`を使用
- **ディレクトリ一覧**: `fs.readdirSync`または`fs.promises.readdir`を使用
- **ディレクトリ作成**: `fs.mkdirSync`または`fs.promises.mkdir`を使用
- **ファイル削除**: `fs.unlinkSync`または`fs.promises.unlink`を使用
- **ディレクトリ削除**: `fs.rmSync`または`fs.promises.rm`を使用

### 3. セキュリティ実装
- パス正規化: `path.resolve()`と`path.normalize()`を使用
- パス検証: 操作パスが許可範囲内であることを確認
- コマンドフィルタリング: コマンドに危険なキーワードが含まれていないかチェック
- エラーハンドリング: 明確なエラーメッセージを提供

## 📝 ドキュメント要件

### 1. README.md内容
- プロジェクト紹介と機能概要
- インストールと設定手順
- ツール使用例
- サポートされるLLMアプリケーション
- トラブルシューティングガイド

### 2. 設定テンプレート
- 汎用的な設定テンプレートを提供
- 詳細な設定説明を含める
- 異なるLLMアプリケーションの設定をサポート

## 🎯 納品要件

### 1. 完全なプロジェクト
- すべてのソースコードファイル
- 設定ファイル
- プロジェクトドキュメント
- 依存関係管理ファイル

### 2. テストと検証
- テストコマンドを提供
- ツール機能を検証
- セキュリティ制限を確認

### 3. 使用手順
- 詳細なインストール手順
- 設定方法
- 使用例

## 💡 重要なヒント

1. **MCPプロトコル**: MCPプロトコル仕様に完全準拠することを確認
2. **クロスプラットフォーム互換性**: 異なるLLMアプリケーション（LM Studio、Qwenなど）をサポート
3. **セキュリティファースト**: すべての操作はセキュリティチェックを通過する必要があります
4. **エラーハンドリング**: 親切なエラーメッセージとハンドリングメカニズムを提供
5. **完全なドキュメント**: ユーザーが迅速に開始できることを確認

## 🚀 期待される結果

最終的に、以下をサポートする完全で安全で強力なMCPサーバープロジェクトを納品：
- ✅ ローカルファイル操作（読み取り、書き込み、一覧、作成、削除）
- ✅ 安全なコマンド実行
- ✅ マルチプラットフォーム互換性（LM Studio、Qwenなど）
- ✅ 完全なセキュリティ制限
- ✅ 詳細なドキュメントと設定

上記の要件に従って完全なプロジェクトを作成してください！
