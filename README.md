# febu

前端部署系统

## 安装

命令行窗口需要能执行`git`命令

增加环境变量
* `NODE_ENV=development`
* `DEBUG=febu*`

安装依赖

	npm install -g gulp
	npm install

## 上线

	gulp release --repo repo [--commit commitid]

例如发布项目[trygit](https://github.com/holyzfy/trygit)的`master`分支的最新代码

	gulp release --repo https://github.com/holyzfy/trygit

## 测试

安装依赖

	npm install -g mocha

运行

	mocha --no-timeouts