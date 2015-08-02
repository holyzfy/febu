# 前端部署流程

* [相关前端优化规则](#相关前端优化规则)
* [febu部署流程](#febu部署流程)
* [约定规则](#约定规则)
* [集成Jenkins](#集成Jenkins)
* [未来功能](#未来功能)

## 相关前端优化规则

* 减小HTTP请求数
* 减少文件大小：min, gzip
* 静态资源缓存：划分主域，缓存，禁cookie

## febu部署流程

* [发布到测试环境](#发布到测试环境)
* [发布到生产环境](#发布到生产环境)
* [回滚](#回滚)

### 发布到测试环境
![发布到测试环境](https://cdn.rawgit.com/holyzfy/febu/master/docs/development.svg)

### 发布到生产环境
![发布到测试环境](https://cdn.rawgit.com/holyzfy/febu/master/docs/production.svg)

### 回滚
![回滚](https://cdn.rawgit.com/holyzfy/febu/master/docs/rollback.svg)

## 约定规则
**项目根目录**：符合AMD规范的项目，www作为项目根目录（[示例](https://github.com/requirejs/example-multipage)）；其他情况时，仓库根目录作为项目根目录

**inc**：inc目录存放模板碎片，模板里的静态资源路径是相对于项目根目录

**生产环境**：模板文件里script，link标签可以使用以下属性
* `_group`：合并多个标签的外部资源
* `_inline`：外部资源的内容打印到当前位置
* `_compress`：与_inline配合使用，打印压缩后的内容

### _group示例
原始代码
```html
<link rel="stylesheet" href="css/common.css" _group="all">
<link rel="stylesheet" href="css/index.css" _group="all">
```
处理后
```html
<link rel="stylesheet" href="//img1.febucdn.com/my_project/style/all.f9e3196e67.css">
```
### _inline和_compress示例
原始代码
```html
<script src="js/config.js" _inline _compress></script>
```
处理后
```html
<script>
require.config({waitSeconds:0,shim:{highcharts:["jquery"],highcharts_more:["highcharts"],url:{exports:"url"},"jquery.pagination":["jquery"],"jquery.event.drag":["jquery"],"jquery.validate":["jquery"],"jquery.validate_common":["jquery.validate"]},paths:{arttemplate:"//img1.febucdn.com/f2e/my_project/js/arttemplate-404a5647dd",common:"//img1.febucdn.com/f2e/my_project/js/common-77fc0b9010",detail:"//img1.febucdn.com/f2e/my_project/js/detail-35cbe12497"}});
</script>
```

## 集成Jenkins

0. 配置node.js
0. 导入环境变量
0. node shell
```markup
git clone https://github.com/holyzfy/febu
npm install
gulp development --repo https://github.com/holyzfy/trygit ## 示例 发布到测试环境
```

## 未来功能

* 组件化
* 推送
* 本地调试生产环境的静态资源