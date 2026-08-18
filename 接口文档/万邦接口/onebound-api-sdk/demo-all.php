<?php 
/**
 * Onebound  API SDK调用示例 仅支持PHP5.3以上
 *    
 * 功能：onebound所有 电商API接口数据调用，缓存,调试    [远程调用]
 * @author 青剑Steven <583964941@qq.com>
 * @link http://www.onebound.cn/
 * @lastModify 2020/11/22 00:55
*/
ini_set('display_errors', '1');
error_reporting(E_ALL & ~E_NOTICE & ~ E_DEPRECATED);
date_default_timezone_set("Asia/Shanghai");
define("SECACHE_SIZE","0");
define("DIR_RUNTIME",dirname(__FILE__)."/runtime/");
include "ObApiClient.php";
include ("time.php");
header('Content-type: text/html; Charset=utf8');
$time_start = getmicrotime();

$ob = new otao\ObApiClient();
$ob->api_url = "https://api-gw.onebound.cn/";
$ob->api_key = "";
$ob->api_secret = "";
$ob->api_version ="";
$ob->secache_path ="/tmp/";
$ob->secache_time ="86400";
$ob->cache = true;
$ob->lang = "cn";
//调用方式一
// $ob->api_type = "jd";
// $ob->api_name = "item_get";
// $ob->api_params=array(
// 	"num_iid"=>1664594
// 	);
$ob->cache = !isset($_GET['del'])?true:false;
$ob->debug = !isset($_GET['debug'])?false:$_GET['debug'];
//调用方式二[固定37行]
$result=array();



$result['jd'] = $ob->exec(
					array(
					'api_type' =>'jd',
					'api_name' =>'item_get',
					'api_params'=>array('num_iid'=>29186819959)
					)
				);



$result['taobao'] = $ob->exec(
					array(
					'api_type' =>'taobao',
					'api_name' =>'item_get',
					'api_params'=>array('num_iid'=>557216270522)
					)
				);



$result['1688'] = $ob->exec(
					array(
					'api_type' =>'1688',
					'api_name' =>'item_get',
					'api_params'=>array('num_iid'=>564876975705)
					)
				);



$result['amazon'] = $ob->exec(
					array(
					'api_type' =>'amazon',
					'api_name' =>'item_get',
					'api_params'=>array('num_iid'=>'B00GW94B1W-cn')//B016LO4UTA
					)
				);



$result['mls'] = $ob->exec(
					array(
					'api_type' =>'mls',
					'api_name' =>'item_get',
					'api_params'=>array('num_iid'=>'1gmuw4o')
					)
				);



$result['translate'] = $ob->exec(
					array(
					'api_type' =>'translate',
					'api_name' =>'t_json',
					'api_params'=>array('text'=>'["Hello world","I\'m come!"]','sl'=>'en','tl'=>'zh-CN')
					)
				);



$fs = file(__FILE__);
$fss=array(
'jd'=>implode('',array_slice($fs, 39,10)),
'taobao'=>implode('',array_slice($fs, 49,10)),
'1688'=>implode('',array_slice($fs, 59,10)),
'amazon'=>implode('',array_slice($fs, 69,10)),
'mls'=>implode('',array_slice($fs, 79,10)),
'translate'=>implode('',array_slice($fs, 89,10)),
	);




//$result = $ob->execute();
echo '<html lang="zh-cn">
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Onebound API SDK调用示例</title>
<link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap.min.css">
<style></style>
</head><body>
<div class="container" >
  <h1 class="page-header" >Onebound API SDK调用示例<small><a href="onebound-api-sdk.zip">[下载]</a></small></h1>';

echo '<div class="highlight"><pre class="code code-php"><code class="html">
//定义缓存目录和引入文件
define("DIR_RUNTIME","runtime/");
define("DIR_ERROR","runtime/");
define("SECACHE_SIZE","15M");

include "ObApiClient.php";

//初始化	
$ob = new ObApiClient();
$ob->api_url = "https://api-gw.onebound.cn/";
$ob->api_key = "demo_api_key";
$ob->api_secret = "";
$ob->api_version ="";
$ob->secache_path ="/tmp/";
$ob->secache_time ="86400";
$ob->cache = true;
$ob->lang = "cn";
	</code></pre></div>';

	foreach($result as $k=>$v){
echo '<fieldset><legend>示例：获取'.$k.' API数据</legend>';
echo '调用代码如下：<div class="highlight"><pre class="code code-php"><code class="html">';
echo str_replace('	',' ',$fss[$k]);
echo '</code></pre></div>';
echo '<textarea class="form-control" style="width:100%;height:200px" ondblclick="this.style.height=\'500px\'">'.print_r($v,true).'</textarea>';
if($error[$k]){
	echo '<p class="text-warning">Error:';
	var_dump($error[$k]);
	echo '</p>';	
}
echo '<p class="text-muted">'. get_use_time().'</p>';
echo '</fieldset>';
echo '<hr>';
}

//var_dump($result);