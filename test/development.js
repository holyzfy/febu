var should = require('should');
var debug = require('debug')('febu:' + __filename);
var replace = require('frep');
var fs = require('fs');
var path = require('path');
var async = require('async');
var common = require('../module/common.js');
var db = require('../module/db.js');
var Dev = require('../module/development.js');
var Git = require('../module/git.js');

describe(__filename, function(){
	var project = {
		repo: 'http://github.com/holyzfy/test_repo_url',
		development: {
			web: '//qa.developer.test.com/'
		},
		production: {
			web: '//img1.cache.test.com/f2e/'
		},
		version: '3bc6453'
	};
	
	var dev = new Dev(project);

	before(function(done){
		dev.db = db;
		db.open(done);
	});

	it('getSource', function(done) {
		var dev = new Dev({
			repo: 'https://github.com/holyzfy/trygit'
		});
		dev.db = db;

		dev.getSource('HEAD', function(err, ret) {
			should.deepEqual(ret, ['**/*']);
			done();
		});
	});

	it('exist', function(done) {
		dev.exist('_a_commit_id', function(err, data) {
			data.should.be.false;
			done();
		});
	});

	var urlRoot = 'http://static.test.febu.com/';
	var patterns = dev.getReplacements(urlRoot);
	
	it('getReplacements css', function(){
		var link = '<link rel="stylesheet" href="css/common.css" _group="all">';
		var linkExpected = '<link rel="stylesheet" href="http://static.test.febu.com/css/common.css" _group="all">';
		var linkActual = replace.strWithArr(link, patterns);
		linkActual.should.equal(linkExpected);

		var link2 = '<link rel="prev" title="专业破坏队形20年" HREF="http://163pinglun.com/archives/15393" />';
		var link2Actual = replace.strWithArr(link2, patterns);
		link2Actual.should.equal(link2);

		var link3 = '<link rel="stylesheet" href=\'css/common.css\' _group="all">';
		var link3Actual = replace.strWithArr(link3, patterns);
		link3Actual.should.equal(linkExpected);

		var link4 = '<link rel="stylesheet" href=css/common.css _group="all">';
		var link4Actual = replace.strWithArr(link4, patterns);
		link4Actual.should.equal(linkExpected);

		var link5 = '<link rel="stylesheet" _group="all" href="css/common.css" />';
		var link5Expected = '<link rel="stylesheet" _group="all" href="http://static.test.febu.com/css/common.css" />';
		var link5Actual = replace.strWithArr(link5, patterns);
		link5Actual.should.equal(link5Expected);

		var link6 = '<link rel="stylesheet" _group="all" href="css/common.css">';
		var link6Expected = '<link rel="stylesheet" _group="all" href="http://static.test.febu.com/css/common.css">';
		var link6Actual = replace.strWithArr(link6, patterns);
		link6Actual.should.equal(link6Expected);

		var link7 = '<link rel="stylesheet" _group="all" href=css/common.css />';
		var link7Expected = '<link rel="stylesheet" _group="all" href="http://static.test.febu.com/css/common.css" />';
		var link7Actual = replace.strWithArr(link7, patterns);
		link7Actual.should.equal(link7Expected);

		var link8 = '<link rel="stylesheet" _group="all" href="http://static.test.febu.com/css/common.css" />';
		var link8Expected = '<link rel="stylesheet" _group="all" href="http://static.test.febu.com/css/common.css" />';
		var link8Actual = replace.strWithArr(link8, patterns);
		link8Actual.should.equal(link8Expected);
	});
	
	it('getReplacements js', function(){
		var script = '<script src="js/arttemplate.js"></script>';
		var scriptExpected = '<script src="http://static.test.febu.com/js/arttemplate.js"></script>';
		var scriptActual = replace.strWithArr(script, patterns);
		scriptActual.should.equal(scriptExpected);

		var script2 = '<script SRC="js/arttemplate.js" _group="all"></script>';
		var script2Expected = '<script src="http://static.test.febu.com/js/arttemplate.js" _group="all"></script>';
		var script2Actual = replace.strWithArr(script2, patterns);
		script2Actual.should.equal(script2Expected);

		var script3 = '<script>alert("test");</script>';
		var script3Actual = replace.strWithArr(script3, patterns);
		script3Actual.should.equal(script3);

		var script4 = '<script src=\'js/arttemplate.js\'></script>';
		var script4Expected = '<script src="http://static.test.febu.com/js/arttemplate.js"></script>';
		var script4Actual = replace.strWithArr(script4, patterns);
		script4Actual.should.equal(script4Expected);

		var script5 = '<script src=""></script>';
		var script5Expected = '<script src=""></script>';
		var script5Actual = replace.strWithArr(script5, patterns);
		script5Actual.should.equal(script5Expected);
	});

	it('getReplacements media', function(){
		var img = '<img src="images/logo.jpg" alt="">';
		var imgExpected = '<img src="http://static.test.febu.com/images/logo.jpg" alt="">';
		var imgActual = replace.strWithArr(img, patterns);
		imgActual.should.equal(imgExpected);

		var img2 = '<img SRC="data:image/png;base64,iVBORw0KGgoAAAANSUh" alt="">';
		var img2Actual = replace.strWithArr(img2, patterns);
		img2Actual.should.equal(img2);

		var img3 = '<img src=\'images/logo.jpg\' alt="">';
		var img3Expected = '<img src="http://static.test.febu.com/images/logo.jpg" alt="">';
		var img3Actual = replace.strWithArr(img3, patterns);
		img3Actual.should.equal(img3Expected);

		var img4 = '<img src="images/logo.jpg" alt="" />';
		var img4Expected = '<img src="http://static.test.febu.com/images/logo.jpg" alt="" />';
		var img4Actual = replace.strWithArr(img4, patterns);
		img4Actual.should.equal(img4Expected);

		var img5 = '<img src="images/logo.jpg"/>';
		var img5Expected = '<img src="http://static.test.febu.com/images/logo.jpg"/>';
		var img5Actual = replace.strWithArr(img5, patterns);
		img5Actual.should.equal(img5Expected);

		var audio = '<audio src="song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
		var audioExpected = '<audio src="http://static.test.febu.com/song.ogg" controls="controls"> Your browser does not support the audio tag. </audio>';
		var audioActual = replace.strWithArr(audio, patterns);
		audioActual.should.equal(audioExpected);

		var audio2 = '<audio controls="controls"> <source src="song.ogg" type="audio/ogg"> <source src="song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
		var audio2Expected = '<audio controls="controls"> <source src="http://static.test.febu.com/song.ogg" type="audio/ogg"> <source src="http://static.test.febu.com/song.mp3" type="audio/mpeg"> Your browser does not support the audio tag. </audio>';
		var audio2Actual = replace.strWithArr(audio, patterns);
		audio2Actual.should.equal(audioExpected);

		var video = '<video src="movie.ogg" controls="controls"> </video>';
		var videoExpected = '<video src="http://static.test.febu.com/movie.ogg" controls="controls"> </video>';
		var videoActual = replace.strWithArr(video, patterns);
		videoActual.should.equal(videoExpected);

		var flash = '<embed src="helloworld.swf">';
		var flashExpected = '<embed src="http://static.test.febu.com/helloworld.swf">';
		var flashActual = replace.strWithArr(flash, patterns);
		flashActual.should.equal(flashExpected);
	});
	
	it('getReplacements object', function(){
		var object = '<object data="bookmark.swf"></object>';
		var objectExpected = '<object data="http://static.test.febu.com/bookmark.swf"></object>';
		var objectActual = replace.strWithArr(object, patterns);
		objectActual.should.equal(objectExpected);
	});

});