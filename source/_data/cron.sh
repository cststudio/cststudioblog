#!/bin/sh

# 定时运行的脚本

# 抓取发布版本
node crawer.js

# 生成网站提示语
node genmainlead.js
