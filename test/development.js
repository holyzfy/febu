var should = require('should');
var debug = require('debug')('febu:' + __filename);
var replace = require('frep');
var db = require('../module/db.js');
var Dev = require('../module/development.js');

describe(__filename, function(){
	var project = {
		repo: 'http://github.com/holyzfy/test_repo_url',
		development: {
			ftp: '',
			web: '//qa.developer.test.com/'
		},
		production: {
			ftp: '',
			web: '//img1.cache.test.com/f2e/'
		},
		version: '3bc6453'
	};
	
	var dev = new Dev(project);

	before(function(done){
		dev.db = db;
		db.init(done);
	});

	it('exist', function(done) {
		dev.exist('_a_commit_id', function(err, data) {
			data.should.be.false;
			done();
		});
	});

	it('getReplacements', function(){
		var urlRoot = 'http://static.test.febu.com/';
		var patterns = dev.getReplacements(urlRoot);

		var link = '<link rel="stylesheet" href="css/common.css" _group="all">';
		var linkExpected = '<link rel="stylesheet" href="http://static.test.febu.com/css/common.css" _group="all">';
		var linkActual = replace.strWithArr(link, patterns);
		linkActual.should.equal(linkExpected);

		var link2 = '<link rel="prev" title="专业破坏队形20年" href="http://163pinglun.com/archives/15393" />';
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
});