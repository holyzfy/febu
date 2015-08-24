var path = require('path');

var defaultDataPath = path.join(__dirname, 'data/');

module.exports = {
	// @link http://docs.mongodb.org/manual/reference/connection-string/
	database: 'mongodb://localhost/febu',

	// 存放部署数据的目录，请填写绝对路径
	dataPath: defaultDataPath,

	// 约定requirejs项目的目录结构
	// 示例 @link https://github.com/holyzfy/amd_template
	amd: {
		tools: 'tools', // 构建目录
		optimizer: 'r.js', // 构建脚本
		config: 'build.js', // 构建用的配置文件
		www: 'www', // 项目目录
		build: 'build' // 构建后的目录
	}
};