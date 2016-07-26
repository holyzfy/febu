var path = require('path');

var defaultDataPath = path.join(__dirname, '../data/');

module.exports = {    
    dataPath: defaultDataPath, // 存放部署数据的目录，请填写绝对路径
    amd: {
        build: 'build' // 构建后的目录
    },
    project: 'febu.json'
};