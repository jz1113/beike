<?php
/*
* 淘宝API初始化文件
*
* @author Steven.liao(lxq73061@qq.com)
* @link http://www.onebound.cn
**/
define('TRANSLATOR_ENGINE','google_free');
define('SECACHE_SIZE',$cfg_secache_size);
include( dirname(__FILE__).'/secache.php' );	
include( dirname(__FILE__).'/secache_no.php' );	
include( dirname(__FILE__).'/curl.class.php' );	
include( dirname(__FILE__).'/ObApiClient.php' );


$obapi = new ObApiClient();
$obapi->api_url = $cfg_taobao_api_url;
//多api服务器自动切换，配置以,号分隔
if(strpos($cfg_taobao_api_url,',')!==false){
	$urls = explode(',',$cfg_taobao_api_url);
	$obapi->api_url = $urls[array_rand($urls)];
	$obapi->api_urls = $urls;
	$obapi->api_urls_on = true;
}
// $ob->api_urls = array("http://api.onebound.cn/");//多url方式
// $obapi->api_urls_on = true;
$obapi->api_key = $cfg_taobao_api_key;
$obapi->api_secret = $cfg_taobao_api_secret;
$obapi->api_version ="";
$obapi->secache_path = DIR_RUNTIME.'secache/';
$obapi->secache_time =$cfg_taobao_secache_time;
$obapi->cache = !isset($_GET['del'])?true:false;
$obapi->debug = !isset($_GET['debug'])?false:$_GET['debug'];
$obapi->lang = $lang?$lang:"cn"; 	
$obapi->prop_lang = $lang?$lang:"cn"; 	
$obapi->translateRemote = true;
$obapi->log_file = DIR_RUNTIME.'logs/api-log.txt'; 	
$obapi->log_dir = DIR_RUNTIME.'logs/'; 	

 $obapi->set_log_db_config(
	array('host'=>$dbhost,'dbname'=>$dbname,'username'=>$dbuser,'password'=>$dbpw,'prefix'=>$tablepre));


if(isset($_GET['debug'])&&$_GET['debug']=='view_log'){
	$obapi->API_view();
}


//支持API的数据缓存到数据库
if($cfg_obapi_cache_db) $obapi->set_db_config(
	array('host'=>$dbhost,'dbname'=>$dbname,'username'=>$dbuser,'password'=>$dbpw,'prefix'=>$tablepre));

?>