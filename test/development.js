var expect = require('expect.js');
var replace = require('frep');
var path = require('path');
var File = require('vinyl');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var util = require('../module/util.js');
var Dev = proxyquire('../module/development.js', {
	'./util.js': {
        getProjectPublicPath: sinon.stub().returns('//qa.developer.test.com/f2e/test_project/')
    }
});

describe(__filename, function(){
	var dev = new Dev({});

	it('resolvePath', function() {
		var index = new File({
		    base: '/myproject',
		    path: '/myproject/index.html'
		});

		var indexRet = dev.resolvePath(index, 'style/common.css');
		expect(indexRet).to.be('//qa.developer.test.com/f2e/test_project/style/common.css');

		var one = new File({
		    base: '/myproject',
		    path: '/myproject/module/one.html'
		});

		var oneRet = dev.resolvePath(one, '../style/common.css');
		expect(indexRet).to.be('//qa.developer.test.com/f2e/test_project/style/common.css');

		var two = new File({
		    base: '/myproject',
		    path: '/myproject/inc/two.html'
		});

		var twoRet = dev.resolvePath(two, 'style/common.css');
		expect(twoRet).to.be('//qa.developer.test.com/f2e/test_project/style/common.css');
	});

	var headStaticFile = new File({
		path: '/test_project/inc/head_static.html'.replace(/\//g, path.sep)
	});
	var patterns = util.getReplacements(dev, 'development', headStaticFile);
	
	it('replaceHref', function(){
		var link = '<link rel="stylesheet" href="css/common.css" _group="all">';
		var linkExpected = '<link rel="stylesheet" href="//qa.developer.test.com/f2e/test_project/css/common.css" _group="all">';
		var linkActual = replace.strWithArr(link, patterns);
		expect(linkActual).to.equal(linkExpected);

		var link2 = '<link rel="prev" title="专业破坏队形20年" HREF="http://163pinglun.com/archives/15393" />';
		var link2Actual = replace.strWithArr(link2, patterns);
		expect(link2Actual).to.equal(link2);

		var link3 = '<link rel="stylesheet" href=\'css/common.css\' _group="all">';
		var link3Actual = replace.strWithArr(link3, patterns);
		expect(link3Actual).to.equal(linkExpected);

		var link4 = '<link rel="stylesheet" href=css/common.css _group="all">';
		var link4Actual = replace.strWithArr(link4, patterns);
		expect(link4Actual).to.equal(linkExpected);

		var link5 = '<link rel="stylesheet" _group="all" href="css/common.css" />';
		var link5Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
		var link5Actual = replace.strWithArr(link5, patterns);
		expect(link5Actual).to.equal(link5Expected);

		var link6 = '<link rel="stylesheet" _group="all" href="css/common.css">';
		var link6Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css">';
		var link6Actual = replace.strWithArr(link6, patterns);
		expect(link6Actual).to.equal(link6Expected);

		var link7 = '<link rel="stylesheet" _group="all" href=css/common.css />';
		var link7Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
		var link7Actual = replace.strWithArr(link7, patterns);
		expect(link7Actual).to.equal(link7Expected);

		var link8 = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
		var link8Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css" />';
		var link8Actual = replace.strWithArr(link8, patterns);
		expect(link8Actual).to.equal(link8Expected);

		var link9 = '<link rel="stylesheet" _group="all" href=css/common.css>';
		var link9Expected = '<link rel="stylesheet" _group="all" href="//qa.developer.test.com/f2e/test_project/css/common.css">';
		var link9Actual = replace.strWithArr(link9, patterns);
		expect(link9Actual).to.equal(link9Expected);

		var link10 = '<link rel="stylesheet" _group="all" href="/css/common.css">';
		var link10Actual = replace.strWithArr(link10, patterns);
		expect(link10Actual).to.equal(link10);
	});
	
	it('replaceSrc script', function(){
		var script = '<script src="js/arttemplate.js"></script>';
		var scriptExpected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js"></script>';
		var scriptActual = replace.strWithArr(script, patterns);
		expect(scriptActual).to.be(scriptExpected);

		var script2 = '<script SRC="js/arttemplate.js" _group="all"></script>';
		var script2Expected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js" _group="all"></script>';
		var script2Actual = replace.strWithArr(script2, patterns);
		expect(script2Actual).to.be(script2Expected);

		var script3 = '<script>alert("test");</script>';
		var script3Actual = replace.strWithArr(script3, patterns);
		expect(script3Actual).to.be(script3);

		var script4 = '<script src=\'js/arttemplate.js\'></script>';
		var script4Expected = '<script src="//qa.developer.test.com/f2e/test_project/js/arttemplate.js"></script>';
		var script4Actual = replace.strWithArr(script4, patterns);
		expect(script4Actual).to.be(script4Expected);

		var script5 = '<script src=""></script>';
		var script5Expected = '<script src=""></script>';
		var script5Actual = replace.strWithArr(script5, patterns);
		expect(script5Actual).to.be(script5Expected);

		var script6 = '<script src="/path/to/test.js"></script>';
		var script6Actual = replace.strWithArr(script6, patterns);
		expect(script6Actual).to.be(script6);

		var script7 = '<script src="$path/to/test.js"></script>';
		var script7Actual = replace.strWithArr(script7, patterns);
		expect(script7Actual).to.be(script7);
	});

	it('replaceSrc media', function(){
		var img = '<img src="images/logo.jpg" alt="">';
		var imgExpected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="">';
		var imgActual = replace.strWithArr(img, patterns);
		expect(imgActual).to.be(imgExpected);

		var img2 = '<img SRC="data:image/png;base64,iVBORw0KGgoAAAANSUh" alt="">';
		var img2Actual = replace.strWithArr(img2, patterns);
		expect(img2Actual).to.be(img2);

		var img3 = '<img src=\'images/logo.jpg\' alt="">';
		var img3Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="">';
		var img3Actual = replace.strWithArr(img3, patterns);
		expect(img3Actual).to.be(img3Expected);

		var img4 = '<img src="images/logo.jpg" alt="" />';
		var img4Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg" alt="" />';
		var img4Actual = replace.strWithArr(img4, patterns);
		expect(img4Actual).to.be(img4Expected);

		var img5 = '<img src="images/logo.jpg"/>';
		var img5Expected = '<img src="//qa.developer.test.com/f2e/test_project/images/logo.jpg"/>';
		var img5Actual = replace.strWithArr(img5, patterns);
		expect(img5Actual).to.be(img5Expected);

		var img6 = '<img src="/images/logo.jpg"/>';
		var img6Actual = replace.strWithArr(img6, patterns);
		expect(img6Actual).to.be(img6);

		var img7 = '<img src="$images/logo.jpg"/>';
		var img7Actual = replace.strWithArr(img7, patterns);
		expect(img7Actual).to.be(img7);

		var audio = '<audio src="song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
		var audioExpected = '<audio src="//qa.developer.test.com/f2e/test_project/song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
		var audioActual = replace.strWithArr(audio, patterns);
		expect(audioActual).to.be(audioExpected);

		var audio2 = '<audio controls="controls"> <source src="song.ogg" type="audio/ogg"> <source src="song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
		var audio2Expected = '<audio controls="controls"> <source src="//qa.developer.test.com/f2e/test_project/song.ogg" type="audio/ogg"> <source src="//qa.developer.test.com/f2e/test_project/song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
		var audio2Actual = replace.strWithArr(audio, patterns);
		expect(audio2Actual).to.be(audioExpected);

		var video = '<video src="movie.ogg" controls="controls"> </video>';
		var videoExpected = '<video src="//qa.developer.test.com/f2e/test_project/movie.ogg" controls="controls"> </video>';
		var videoActual = replace.strWithArr(video, patterns);
		expect(videoActual).to.be(videoExpected);

		var flash = '<embed src="helloworld.swf">';
		var flashExpected = '<embed src="//qa.developer.test.com/f2e/test_project/helloworld.swf">';
		var flashActual = replace.strWithArr(flash, patterns);
		expect(flashActual).to.be(flashExpected);
	});
	
	it('replaceData object', function(){
		var object = '<object data="bookmark.swf"></object>';
		var objectExpected = '<object data="//qa.developer.test.com/f2e/test_project/bookmark.swf"></object>';
		var objectActual = replace.strWithArr(object, patterns);
		expect(objectActual).to.be(objectExpected);
	});

	it('replaceUrl:background-image', function() {
		var style = '<style>.nav {background-image: url("images/nav.png");}</style>';
		var expected = '<style>.nav {background-image: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(expected);
	});

	it('replaceUrl:background-image (absolute path)', function() {
		var style = '<style>.nav {background-image: url("/images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(style);
	});

	it('replaceUrl:background-image (vm variable path)', function() {
		var style = '<style>.nav {background-image: url("$images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(style);
	});

	it('replaceUrl:background', function() {
		var style = '<style>.nav {background: url("images/nav.png");}</style>';
		var expected = '<style>.nav {background: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(expected);
	});

	it('replaceUrl:border-image', function() {
		var style = '<style>.nav {border-image: url("images/nav.png");}</style>';
		var expected = '<style>.nav {border-image: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(expected);
	});

	it('replaceUrl:border', function() {
		var style = '<style>.nav {border: url("images/nav.png");}</style>';
		var expected = '<style>.nav {border: url("//qa.developer.test.com/f2e/test_project/images/nav.png");}</style>';
		var actual = replace.strWithArr(style, patterns);
		expect(actual).to.be(expected);
	});

	it('replaceUrl:sript', function() {
		var script = '<script>var thisUrl = url("?companyId");</script>';
		var actual = replace.strWithArr(script, patterns);
		expect(actual).to.be(script);
	});

});