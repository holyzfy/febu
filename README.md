# Febu

前端构建工具

[![Build Status](https://travis-ci.org/holyzfy/febu.svg?branch=master)](https://travis-ci.org/holyzfy/febu)
[![Dependency Status](https://david-dm.org/holyzfy/febu.svg)](https://david-dm.org/holyzfy/febu)

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [安装](#%E5%AE%89%E8%A3%85)
- [发布](#%E5%8F%91%E5%B8%83)
  - [参数](#%E5%8F%82%E6%95%B0)
  - [发布到测试环境](#%E5%8F%91%E5%B8%83%E5%88%B0%E6%B5%8B%E8%AF%95%E7%8E%AF%E5%A2%83)
  - [发布到生产环境](#%E5%8F%91%E5%B8%83%E5%88%B0%E7%94%9F%E4%BA%A7%E7%8E%AF%E5%A2%83)
- [约定规则](#%E7%BA%A6%E5%AE%9A%E8%A7%84%E5%88%99)
  - [静态资源路径](#%E9%9D%99%E6%80%81%E8%B5%84%E6%BA%90%E8%B7%AF%E5%BE%84)
  - [inc](#inc)
  - [html](#html)
    - [_group示例](#_group%E7%A4%BA%E4%BE%8B)
    - [_inline和_compress示例](#_inline%E5%92%8C_compress%E7%A4%BA%E4%BE%8B)
  - [febu.json](#febujson)
- [测试](#%E6%B5%8B%E8%AF%95)
- [示例项目](#%E7%A4%BA%E4%BE%8B%E9%A1%B9%E7%9B%AE)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 安装

0. 命令行窗口需要能执行`git`命令
0. [配置node.js](https://github.com/holyzfy/frontend_guidelines/issues/7)（可选步骤）
0. 编辑`config/default.js`并另存为`config/local.js`（可选步骤）
0. 安装依赖`npm install`

安装时可能遇到的问题 :point_right: https://github.com/holyzfy/febu/issues/6

## 发布

仅支持发布git项目

### 参数
- **repo** git仓库地址
- **branch** 分支或标签，默认是`master`
- **commit** 版本号，默认是`HEAD`
- **publicPath** 静态资源前缀，默认从项目的`febu.json`里取
- **dist** 构建结果的输出目录，请填写绝对路径

### 发布到测试环境

	gulp development --repo repo [--branch branch] [--commit commitid] [--publicPath publicPath] [--dist distPath]

例如发布项目[amd_demo](https://github.com/holyzfy/amd_demo)的`master`分支的最新代码

	gulp development --repo https://github.com/holyzfy/trygit

### 发布到生产环境

	gulp production --repo repo [--branch branch] [--commit commitid] [--publicPath publicPath] [--dist distPath]

## 约定规则

### 静态资源路径

如果静态资源路径以`/`开头，约定`/`表示仓库根目录，例如：

```html
<img src="/images/logo.png">
```

```css
.logo {
    background-image: url(/images/logo.png);
}
```

`//`开头的路径不处理，例如：

```html
<img src="//www.example.com/path/to/images/logo.png">
```

### inc

inc目录存放html碎片，html碎片里的静态资源路径是相对于仓库根目录

### html

html文件里script，link标签可以使用以下属性（生产环境下有效）

| 属性 | 描述 |
| :------- | :-------- |
| _group | 合并多个标签的外部资源 |
| _inline | 把静态资源的内容直接输出到页面 |
| _compress | 与_inline配合使用，输出压缩后的内容 |

#### _group示例

对于同一个页面，_group值一样的link标签合并到一起，_group值一样的script标签合并到一起

原始代码

```html
<link rel="stylesheet" href="style/common.css" _group="all">
<link rel="stylesheet" href="style/index.css" _group="all">
```

处理后

```html
<link rel="stylesheet" href="//img1.febucdn.com/my_project/style/all.f9e3196e67.css">
```

#### _inline和_compress示例

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

### febu.json

项目根目录下创建febu.json，来指定部署的配置项（所有配置项都是选填），示例：

```javascript
{
    "docRootPrefx": "/",
    "build": "./build.js", // requirejs的构建脚本，示例 https://github.com/holyzfy/amd_demo/blob/master/build.js
    "ignore": [             // 忽略的文件或目录，支持minimatch语法 (https://www.npmjs.com/package/minimatch)
        "node_modules",
        "build",
        "build.js",
        "mock/**/*.js"
        "test"
    ],
    "jsnext": {            // es6配置项，示例项目 https://github.com/holyzfy/amd_demo/tree/jsnext
        "src": "jsnext",   // js源代码目录
        "output": "js",    // 输出目录
        "ignore": ["jsnext/lib", "jsnext/config.js"] // 编译时忽略的文件或目录
    },
    "development": {      // 发布到测试环境时静态资源前缀
        "publicPath": "//static.f2e.example.com/project"
    },
    "production": {     // 发布到生产环境时静态资源前缀
        "publicPath": "//examplecdn.com/project"
    }
}
```

## 测试

```npm test```

## 示例项目

- 常规的写法 https://github.com/holyzfy/trygit
- 使用了AMD规范 https://github.com/holyzfy/amd_demo
