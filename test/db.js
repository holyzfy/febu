var db = require('../module/db.js');
var should = require('should');
var debug = require('debug')('febu:' + __filename);

describe(__filename, function(){
	var repo = 'test_repo_url';

	before(function(done){
		db.open(done);
	});

	after(function(done) {
		db.close(done);
	});

	it('db.projects.save', function(done){
		var project = {
			repo: repo,
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
		db.projects.save(project, done);		
	});
	
	it('db.projects.find', function(done) {
		db.projects.find(repo, function(err, ret){
			should.not.exist(err);
			should.exist(ret);
			done();
		});
	});

	it('db.projects.remove', function(done) {
		var conditions = {
			repo: repo
		};
		db.projects.remove(conditions, done);
	});

	it('db.versions.save', function(done){
		var data = {
			repo: repo,
			type: 'development',
			src: '9bfb77f',
			dest: 'yuk0573'
		};
		db.versions.save(data, done);
	});

	it('db.versions.find', function(done) {
		db.versions.find({src: '9bfb77f', repo: repo}, function(err, doc) {
			should.not.exist(err);
			should.exist(doc);
			done();
		});
	});

	it('db.versions.remove', function(done) {
		db.versions.remove({src: '9bfb77f', repo: repo}, done);
	});
	
});