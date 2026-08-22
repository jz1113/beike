<?php
/**
* 万邦API加密sing调用请求示例
* @last modify: 2020-11-22
*/

if(isset($_GET['down'])){

  header("Content-type: application/octet-stream");
  header("Accept-Ranges: bytes");
  header("Accept-Length: ".filesize(__FILE__));
  header("Content-Disposition: attachment; filename=demo-sign.php"); 

  echo file_get_contents(__FILE__);
  exit();
}


$api_key = 'test_api_key';
$secret_key="";
$api_type="taobao";
$api_name="item_fee";
if(isset($_GET['api_type']))$api_type =$_GET['api_type'];
if(isset($_GET['key']))$api_key =$_GET['key'];
if(isset($_GET['secret']))$secret_key =$_GET['secret'];
if(isset($_GET['api_name']))$api_name =$_GET['api_name'];

$api_url = 'http://api.onebound.cn/'.$api_type.'/'.$api_name;
$param=array(
	'num_iid'=>'572050066584',
	'area_id'=>'152501',
	'sku'=>'1',
);

if(isset($_GET['param']))$param = json_decode($_GET['param'],true);
$param1=$param;
/**********明文请求（不安全）**********/
$url = $api_url.'?key='.$api_key.'&'.http_build_query($param1).'&secret='.$secret_key;

$result = file_get_contents($url);
$json = json_decode($result,true);
echo '<h1>Onebound API 加密方式示例代码</h1><hr>';
echo '[<a href="?down">下载本源码</a>]';
echo '<br><form>';
echo '...........Key：<input name="key" value="'.htmlspecialchars($api_key).'"><br>';
echo '........Secret：<input name="secret" value="'.htmlspecialchars($secret_key).'"><br>';
echo '........api_type：<input name="api_type" value="'.htmlspecialchars($api_type).'"><br>';
echo '........api_name：<input name="api_name" value="'.htmlspecialchars($api_name).'"><br>';
echo '递交参数(json）：<input name="param" size="50" value="'.htmlspecialchars(json_encode($param1)).'"><br>';
echo '<input type="submit" value="测试">';
echo '</form>';

echo '<h2>'.($url).'</h2>';
echo '<pre style="height: 400px; overflow: auto">';
echo str_replace('<','&lt;',print_r($json,true));
echo '</pre>';


/**********加密请求（安全）**********/
if(strlen($secret_key)!=32) $secret_key = MD5($secret_key); //密钥先进行MD5加密
$param['api_name'] = $api_name;                  //声明加密方式
$param['key'] = $api_key;                  //声明加密方式
$param['dateline'] = date("Y-m-d H:i:s");       //dateline参数以生成不重复的sign
$sign = generate_hash($secret_key,$param);      //根据密钥生成sign HASH
$param['sign'] = $sign;                         //将sign加入请求参数
unset($param['api_name']); //不在URL中重复体现api_name
unset($param['key']);      //不在URL中重复体现key

$url = $api_url.'?key='.$api_key.'&'.http_build_query($param);   //将api网关和请求参数进行拼接
$result = file_get_contents($url);              //http方式调用API
$json = json_decode($result,true);              //对调用结果进行json解析到数组

echo '<h2>'.($url).'</h2>';
echo '<pre style="height: 400px; overflow: auto">';
echo str_replace('<','&lt;',print_r($json,true));
echo '</pre>';



/**
* 根据密钥生成HASH
* @param $secret_key string MD5加密后的密钥
* @param $parameters array 请求参数数组
*/
function generate_hash($secret_key,$parameters)
{
    unset($parameters['secret']);//如果参数里有secret值，不参与运算
    unset($parameters['sign']);//如果参数里有sign值，不参与运算
    ksort($parameters);//按键名对数组进行排序
    $appendAmp=0;    
    $parametersToHash=""; //用于拼接用的字符串
    foreach ($parameters as $key => $value) {        
        if (strlen($value) > 0 && "@" != substr($value, 0, 1) ) {//值的长度不等于0，且不是@开头（文件上传类型参数）
            if ($appendAmp == 0) {
                $parametersToHash .= $key . '=' . $value; //用于计算安全HASH，不使用urlencode
                $appendAmp = 1;
            } else {
                $parametersToHash .= '&' . $key . "=" . $value;
            }            
        }
    }
    
    $packedSecret = $secret_key;
    $securedHash= md5($parametersToHash.$packedSecret);//拼接字符串+密钥再次加密

    return $securedHash;
}