# febu

前端部署系统

## 安装

0. 命令行窗口需要能执行`git`命令

0. 安装MongoDB

0. 配置config.js

0. 安装依赖

	* `npm install -g gulp`
	* `npm install`

## 发布到测试环境

	gulp development --repo repo [--commit commitid]

例如发布项目[trygit](https://github.com/holyzfy/trygit)的`master`分支的最新代码

	gulp development --repo https://github.com/holyzfy/trygit

## 发布到正式环境

	gulp production --repo repo [--commit commitid]

## 测试

增加环境变量
* `NODE_ENV=development`
* `DEBUG=febu*`

安装依赖

	npm install -g mocha

运行

	mocha --no-timeouts