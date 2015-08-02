# febu

[前端部署系统](http://holyzfy.github.io/febu/)

## 安装

0. 命令行窗口需要能执行`git`命令
0. 安装MongoDB，并[初始化一个项目](https://github.com/holyzfy/febu/wiki/init_project)
0. 配置config.js
0. 安装依赖
	* `npm install -g gulp`
	* `npm install`

## 发布

仅支持发布 master 分支的代码

### 参数
* **repo** 仓库地址
* **commit** 版本号，默认是HEAD，版本号长度>=7

### 发布到测试环境

	gulp development --repo repo [--commit commitid]

例如发布项目[trygit](https://github.com/holyzfy/trygit)的 master 分支的最新代码

	gulp development --repo https://github.com/holyzfy/trygit

### 发布到生产环境

	gulp production --repo repo [--commit commitid]


## 测试

0. 增加环境变量
	* `NODE_ENV=development`
	* `DEBUG=febu*`
0. 安装依赖 `npm install -g mocha`
0. 运行 `mocha --no-timeouts`