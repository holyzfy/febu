/**
 * @constructor
 * @param {String} rep 仓库地址
 */
function Git(rep) {
	
}

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径+项目名构成（/用_代替）
 * @return {Promise} 
 */
Git.prototype.clone = function() {

}

/**
 * 进入仓库根目录
 * @return {Promoise}
 */
Git.prototype.enter = function() {

}

/**
 * 拉取远程分支
 * @return {Promise}
 */
Git.prototype.pull = function(){
	
};

/**
 * 切换分支
 * @param  {String} branch 分支名
 * @return {Promise}        
 */
Git.prototype.checkout = function(branch){

};

/**
 * 查询日志
 * @param  {String} commit 版本号
 * @return {Promise}        
 */
Git.prototype.log = function(commit) {
	
};

/**
 * 比较两次提交的差异
 * @param  {String} from 版本号
 * @param  {String} to   版本号
 * @return {Promise}     
 */
Git.prototype.diff = function(from, to) {

};