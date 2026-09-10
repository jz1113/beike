#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    source "$NVM_DIR/nvm.sh"
  fi
fi
if ! command -v node >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "请先安装 Node.js 22、Rust 和 Xcode Command Line Tools。"
  read "?按回车退出"
  exit 1
fi
npx --yes pnpm@10.13.1 install --frozen-lockfile && bash works/scripts/desktop/build-macos-dmg.sh
result=$?
if [[ $result -eq 0 ]]; then
  open "desktop/target/release/bundle"
  echo "打包成功，安装包目录已打开。"
else
  echo "打包失败，请检查上方错误。"
fi
read "?按回车退出"
exit $result
