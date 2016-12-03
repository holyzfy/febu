var tape = require('tape');
var replace = require('frep');
var path = require('path');
var File = require('vinyl');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var util = require('../module/util.js');
var Dev = proxyquire('../module/development.js', {
	'./util.js': {
        getProjectPublicPath: sinon.stub().returns('//qa.developer.test.com/f2e/test_project/')
    },
    'fs-extra': {
    	accessSync: sinon.spy()
    }
});

var dev = new Dev({
	repo: 'https://github.com/xxx/one_project'
});

tape('resolvePath', test => {
	var index = new File({
	    base: '/myproject',
	    path: '/myproject/index.html'
	});

	var indexRet = dev.resolvePath(index, 'style/common.css');
	test.equal(indexRet, '//qa.developer.test.com/f2e/test_project/style/common.css');

	var indexRet2 = dev.resolvePath(index, 'style/common.css?v=1.0.1');
	test.equal(indexRet2, '//qa.developer.test.com/f2e/test_project/style/common.css');

	var one = new File({
	    base: '/myproject',
	    path: '/myproject/module/one.html'
	});

	var oneRet = dev.resolvePath(one, '../style/common.css');
	test.equal(indexRet, '//qa.developer.test.com/f2e/test_project/style/common.css');

	var two = new File({
	    base: '/myproject',
	    path: '/myproject/inc/two.html'
	});

	var twoRet = dev.resolvePath(two, 'style/common.css');
	test.equal(twoRet, '//qa.developer.test.com/f2e/test_project/style/common.css');

	test.end();
});

var headStaticFile = new File({
	path: '/test_project/inc/head_static.html'.replace(/\//g, path.sep)
});
var patterns = util.getReplacements(dev, 'development', headStaticFile);

tape('replaceHref', test => {
	var link = '<link rel="stylesheet" href="css/common.css" _group="all">';
	var linkExpected = '<link rel="stylesheet" href="//qa.developer.test.com/f2e/test_project/css/common.css" _group="all">';
	var linkActual = replace.strWithArr(link, patterns);
	test.equal(linkActual, linkExpected);

	var link2 = '<link rel="prev" title="专业破坏队形20年" HREF="http://163pinglun.com/archives/15393" />';
	var link2Actual = replace.strWithArr(link2, patterns);
	test.equal(link2Actual, link2);

	var link3 = '<link rel="stylesheet" href=\'css/common.css\' _group="all">';
	var link3Actual = replace.strWithArr(link3, patterns);
	test.equal(link3Actual, linkExpected);

	var link4 = '<link rel="stylesheet" href=css/common.css _group="all">';
	var link4Actual = replace.strWithArr(link4, patterns);
	test.equal(link4Actual, linkExpected);

	var link5 = '<link rel="stylesheet" _group="all" href="css/common.css" />';
	var link5Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
	var link5Actual = replace.strWithArr(link5, patterns);
	test.equal(link5Actual, link5Expected);

	var link6 = '<link rel="stylesheet" _group="all" href="css/common.css">';
	var link6Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css">';
	var link6Actual = replace.strWithArr(link6, patterns);
	test.equal(link6Actual, link6Expected);

	var link7 = '<link rel="stylesheet" _group="all" href=css/common.css />';
	var link7Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
	var link7Actual = replace.strWithArr(link7, patterns);
	test.equal(link7Actual, link7Expected);

	var link8 = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
	var link8Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
	var link8Actual = replace.strWithArr(link8, patterns);
	test.equal(link8Actual, link8Expected);

	var link9 = '<link rel="stylesheet" _group="all" href=css/common.css>';
	var link9Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css">';
	var link9Actual = replace.strWithArr(link9, patterns);
	test.equal(link9Actual, link9Expected);

	var link10 = '<link rel="stylesheet" _group="all" href="/css/common.css">';
	var link10Actual = replace.strWithArr(link10, patterns);
	test.equal(link10Actual, link10);

	test.end();
});

tape('replaceSrc script', test => {
	var script = '<script src="js/arttemplate.js"></script>';
	var scriptExpected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js"></script>';
	var scriptActual = replace.strWithArr(script, patterns);
	test.equal(scriptActual, scriptExpected);

	var script2 = '<script SRC="js/arttemplate.js" _group="all"></script>';
	var script2Expected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js" _group="all"></script>';
	var script2Actual = replace.strWithArr(script2, patterns);
	test.equal(script2Actual, script2Expected);

	var script3 = '<script>alert("test");</script>';
	var script3Actual = replace.strWithArr(script3, patterns);
	test.equal(script3Actual, script3);

	var script4 = '<script src=\'js/arttemplate.js\'></script>';
	var script4Expected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js"></script>';
	var script4Actual = replace.strWithArr(script4, patterns);
	test.equal(script4Actual, script4Expected);

	var script5 = '<script src=""></script>';
	var script5Expected = '<script src=""></script>';
	var script5Actual = replace.strWithArr(script5, patterns);
	test.equal(script5Actual, script5Expected);

	var script6 = '<script src="/path/to/test.js"></script>';
	var script6Actual = replace.strWithArr(script6, patterns);
	test.equal(script6Actual, script6);

	var script7 = '<script src="$path/to/test.js"></script>';
	var script7Actual = replace.strWithArr(script7, patterns);
	test.equal(script7Actual, script7);

	test.end();
});

tape('replaceSrc media', test => {
	var img = '<img src="images/logo.jpg" alt="">';
	var imgExpected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="">';
	var imgActual = replace.strWithArr(img, patterns);
	test.equal(imgActual, imgExpected);

	var img2 = '<img SRC="data:image/png;base64,iVBORw0KGgoAAAANSUh" alt="">';
	var img2Actual = replace.strWithArr(img2, patterns);
	test.equal(img2Actual, img2);

	var img3 = '<img src=\'images/logo.jpg\' alt="">';
	var img3Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="">';
	var img3Actual = replace.strWithArr(img3, patterns);
	test.equal(img3Actual, img3Expected);

	var img4 = '<img src="images/logo.jpg" alt="" />';
	var img4Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="" />';
	var img4Actual = replace.strWithArr(img4, patterns);
	test.equal(img4Actual, img4Expected);

	var img5 = '<img src="images/logo.jpg"/>';
	var img5Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg"/>';
	var img5Actual = replace.strWithArr(img5, patterns);
	test.equal(img5Actual, img5Expected);

	var img6 = '<img src="/images/logo.jpg"/>';
	var img6Actual = replace.strWithArr(img6, patterns);
	test.equal(img6Actual, img6);

	var img7 = '<img src="$images/logo.jpg"/>';
	var img7Actual = replace.strWithArr(img7, patterns);
	test.equal(img7Actual, img7);

	var audio = '<audio src="song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
	var audioExpected = '<audio src="//qa.developer.test.com/f2e/test_project/song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
	var audioActual = replace.strWithArr(audio, patterns);
	test.equal(audioActual, audioExpected);

	var audio2 = '<audio controls="controls"> <source src="song.ogg" type="audio/ogg"> <source src="song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
	var audio2Expected = '<audio controls="controls"> <source src="//qa.developer.test.com/f2e/test_project/song.ogg" type="audio/ogg"> <source src="//qa.developer.test.com/f2e/test_project/song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
	var audio2Actual = replace.strWithArr(audio, patterns);
	test.equal(audio2Actual, audioExpected);

	var video = '<video src="movie.ogg" controls="controls"> </video>';
	var videoExpected = '<video src="//qa.developer.test.com/f2e/test_project/movie.ogg" controls="controls"> </video>';
	var videoActual = replace.strWithArr(video, patterns);
	test.equal(videoActual, videoExpected);

	var flash = '<embed src="helloworld.swf">';
	var flashExpected = '<embed src="//qa.developer.test.com/f2e/test_project/helloworld.swf">';
	var flashActual = replace.strWithArr(flash, patterns);
	test.equal(flashActual, flashExpected);

	test.end();
});

tape('replaceData object', test => {
	var object = '<object data="bookmark.swf"></object>';
	var objectExpected = '<object data="//qa.developer.test.com/f2e/test_project/bookmark.swf"></object>';
	var objectActual = replace.strWithArr(object, patterns);
	test.equal(objectActual, objectExpected);
	test.end();
});

tape('replaceSrcset', test => {
	var img = `
		<img srcset="path/to/large.jpg 1024w,
		             path/to/medium.jpg 640w,
		             http://xxx.com/path/to/small.jpg 320w"
		    src="">`;
	var expected = `
		<img srcset="//qa.developer.test.com/f2e/test_project/path/to/large.jpg 1024w,
		             //qa.developer.test.com/f2e/test_project/path/to/medium.jpg 640w,
		             http://xxx.com/path/to/small.jpg 320w"
		    src="">`;
	var actual = replace.strWithArr(img, patterns);
	test.equal(actual, expected);
	test.end();
});

tape('replaceUrl:background-image', test => {
	var style = '<style>.nav {background-image: url("images/nav.png");}</style>';
	var expected = '<style>.nav {background-image: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, expected);
	test.end();
});

tape('replaceUrl:background-image (absolute path)', test => {
	var style = '<style>.nav {background-image: url("/images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, style);
	test.end();
});

tape('replaceUrl:background-image (vm variable path)', test => {
	var style = '<style>.nav {background-image: url("$images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, style);
	test.end();
});

tape('replaceUrl:background', test => {
	var style = '<style>.nav {background: url("images/nav.png");}</style>';
	var expected = '<style>.nav {background: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, expected);
	test.end();
});

tape('replaceUrl:border-image', test => {
	var style = '<style>.nav {border-image: url("images/nav.png");}</style>';
	var expected = '<style>.nav {border-image: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, expected);
	test.end();
});

tape('replaceUrl:border', test => {
	var style = '<style>.nav {border: url("images/nav.png");}</style>';
	var expected = '<style>.nav {border: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
	var actual = replace.strWithArr(style, patterns);
	test.equal(actual, expected);
	test.end();
});

tape('replaceUrl:sript', test => {
	var script = '<script>var thisUrl = url("?companyId");</script>';
	var actual = replace.strWithArr(script, patterns);
	test.equal(actual, script);
	test.end();
});
