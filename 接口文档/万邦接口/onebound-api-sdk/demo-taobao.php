<?php
/**
 * Onebound API SDK 调用示例(TAOBAO)
 *    
 * 功能：API接口数据调用，缓存,调试    [远程调用]
 * @author 青剑Steven <583964941@qq.com>
 * @link http://www.onebound.cn/
 * @lastModify 2020/11/22 00:55
*/

ini_set('display_errors', '1');
error_reporting(E_ALL & ~E_NOTICE & ~ E_DEPRECATED);
date_default_timezone_set("Asia/Shanghai");

//定义缓存目录和引入文件
define('DIR_RUNTIME','runtime/');
define('DIR_ERROR','runtime/');
define('SECACHE_SIZE','0');
define('DS',DIRECTORY_SEPARATOR);

include ("ObApiClient.php");

$obapi = new otao\ObApiClient();
$obapi->api_url = 'https://api-gw.onebound.cn/';
// $obapi->api_urls = array('http://api.onebound.cn/','http://api-1.onebound.cn/');//备用API服务器
$obapi->api_urls_on = true;//当网络错误时，是否启用备用API服务器
$obapi->api_key = '';
$obapi->api_secret = '';
$obapi->api_version ='';
$obapi->secache_path ='runtime/';
$obapi->secache_time ='86400';
$obapi->cache = true;
$obapi->lang = 'cn';


include ("time.php");
header("Content-Type: text/html; charset=utf-8");
echo '<html lang="zh-cn">
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Onebound API SDK调用示例(TAOBAO)</title>
<link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap.min.css">
<style></style>
</head><body>
<div class="container" >
  <h1 class="page-header" >Onebound API SDK调用示例(TAOBAO)<small>[<a href="demo-all.php">调用所有平台API示例</a>]</small><small><a href="onebound-api-sdk.zip">[下载]</a></small></h1>
  
';



$fs = file(__FILE__);$fs1=$fs2=$fs3=$fs4=$fs5=$fs;
echo '<div class="highlight"><pre class="code code-php"><code class="html">
'.implode("",array_splice($fs1,14,31-14)).'
    </code></pre></div>';
  
$time_start = getmicrotime();

//示例：获取分类ID=16的商品列表
$api_data = $obapi->exec(array(
    'api_type' => 'taobao', 
    'api_name' => 'item_search', 
    'api_params' => array(
        'q' => '', 
        'page' => 1, 
        'cat' => 16,
        'sort' => '', 
        'page_size' => '', 
        'ppath' => '', 
        'imgid' => ''
        )));
$items=$api_data['items'];


echo '<fieldset><legend>示例：获取分类ID=16的商品列表 item_search:</legend>
<textarea class="form-control" style="width:100%;height:200px" ondblclick="this.style.height=\'500px\'">'.htmlspecialchars(print_r($items,true)).'</textarea>'.'<br>';    
echo '<p class="text-muted">'. get_use_time().'</p>';
if($obapi->error){
    echo '<p class="text-warning">Error:';
    var_dump($obapi->error);
    echo '</p>';    
}
echo '</fieldset>';
echo '获取分类代码如下：<pre class="code code-php"> 
<code>
'.implode("",array_splice($fs2,59,15)).'
print_r($items);
  </code></pre><hr>';
$time_start = getmicrotime();



//示例：获取产品ID=39881745164的商品详细
$api_data = $obapi->exec(
                array(
                'api_type' =>'taobao',
                'api_name' =>'item_get',
                'api_params'=>array('num_iid'=>621615764909)
                )
            );
$item = $api_data['item'];


echo '<fieldset><legend>示例：获取产品ID=39881745164的商品详细 item_get:</legend>
<textarea class="form-control" style="width:100%;height:200px" ondblclick="this.style.height=\'500px\'">'.htmlspecialchars(print_r($item,true)).'</textarea>'.'<br>';    
 
echo '<p class="text-muted">'. get_use_time().'</p>';
if($obapi->error){
    echo '<p class="text-warning">Error:';
    var_dump($obapi->error);
    echo '</p>';
    
}
echo '</fieldset>';
echo '获取产品代码如下：<pre class="code code-php">
<code> 
'.implode("",array_splice($fs3,95,104-95)).'
 print_r($item);
 </code></pre><hr>';
////示例：获取缓存列表和清理缓存
//    $list = $this->taobaoAPI->secache_list();
//    $this->taobaoAPI->secache_clear('obapi_get_taobao_item_en.php');
//    $this->taobaoAPI->secache_clear();
echo '</div>';


echo '<style>.debug_info{margin:auto!important}</style>';
//$obapi->obapi_debug();//调试信息

echo '<div class="bg-info footerinfo" style="">
<p class="text-muted">
<span style="float:right;"></span>

<img src="//www.onebound.cn/wp-content/themes/cross-apple/assets/images/logo.png" width="120">
Powered by：<a href="//www.onebound.cn">万邦</a>
www.onebound.cn All Rights Reserved. 

 QQ:583964941</p>
</div>';
echo '<script>
    var _hmt = _hmt || [];
    (function() {
        var hm = document.createElement("script");
        hm.src = "https://hm.baidu.com/hm.js?528a5adfa2035597bba02a22a9fa4b57";
        var s = document.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(hm, s);
    })();
</script>';
 echo '</body></html>';
?>