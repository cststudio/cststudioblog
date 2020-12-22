#!/bin/bash

uname -a
g++ --version
node -v
npm -v

ls -lh

# apt-get update -qq && apt-get install -y -qq software-properties-common
# curl -sL https://deb.nodesource.com/setup_10.x | bash -
# echo "install nodejs"
# apt-get update -qq && apt-get install -y -qq nodejs sshpass

export TZ='Asia/Shanghai' # 更改时区
npm install hexo-cli -g
npm install || exit 1 # 安装hexo及插件
# 下载生成好的网站文件，里面有些文件需要用到
git clone https://github.com/cststudio/cststudio.github.io/ /tmp/git/

# 做些更新，再生成
ls
ls -lh /tmp/git/
cd source/_data
chmod +x cron.sh
sh cron.sh
cd -
hexo clean # 清除
hexo g # 生成

echo "after script..."
cd ./public
rm ./book/ep ./book/ellp  -rf || true # 尝试删除已有的，用true不会报错  ep是临时的，后面要删除
cp -a /tmp/git/book/ep ./book || true
cp -a /tmp/git/book/ellp ./book || true
git init
git config user.name  "CST Studio"
git config user.email "cst@cststudio.com.cn"
git add .
git commit -m "CI auto update"
git push --force --quiet "https://${CSTTravisCIToken}@github.com/cststudio/cststudio.github.io/" master:master

sudo apt-get update
sudo apt-get install -y sshpass

# 登陆到远程主机执行命令
echo "try to download html in remote host..."
sshpass -p "$PASSWD" ssh -o StrictHostKeyChecking=no $USER@$HOST "cd $COMPOSE/websites/html_tmp && git checkout . && git pull" || exit 1
- echo "\r\npush done"
