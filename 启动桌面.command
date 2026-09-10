#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
chmod +x "$DIR/works/launch/启动桌面.command" 2>/dev/null
exec "$DIR/works/launch/启动桌面.command"
