<?php
/**
 * 万邦API调用SDK
 * 支持taobao/tmall、1688、amazon、jd、mls、translate等万邦科技提供的api接口调用
 * 支持多api服务器网址定义，当网络错误时自动使用下一个API服务器获取数据
 * 支持调试调用过程
 * 支持缓存到本地单文件
 * 支持缓存到数据库
 * 支持命名空间（针对THINK PHP优化)
 * GET参数必须包括KEY和API_NAME
 *
* @last_modify 2020-10-15 12:00:00
* @author Steven.liao
*
 * $obapi = new ObApiClient();
 * $obapi->api_url = "http://api.onebound.cn/";
 * //$ob->api_urls = array("http://api.onebound.cn/","http://api-1.onebound.cn/");
 * $obapi->api_urls_on = true;
 * $obapi->api_key = $cfg_taobao_api_key;
 * $obapi->api_secret = $cfg_taobao_api_secret;
 * $obapi->api_version ="";
 * $obapi->secache_time =$cfg_taobao_secache_time;
 * $obapi->cache = true;
 * $obapi->cache_local = true;
 * $obapi->debug = false;
 * $obapi->log_file = '';
 * $obapi->set_db_config(array('host'=>$dbhost,'dbname'=>$dbname,'username'=>$dbuser,'password'=>$dbpw,'prefix'=>$tablepre));
 *
 **/
namespace otao;

#ini_set('display_error', 'off');
error_reporting(0);

include_once dirname(__FILE__) . "/secache.php";
include_once dirname(__FILE__) . "/secache_no.php";
include_once dirname(__FILE__) . "/curl.class.php";
include_once dirname(__FILE__) . "/ObApiDB.php";
include_once dirname(__FILE__) . "/ObApiCache.php";
include_once dirname(__FILE__) . "/ObApiHelper.php";
include_once dirname(__FILE__) . "/ObApiLog.php";
#include_once dirname(__FILE__) . "/ObApiTranslate.php";
include_once dirname(__FILE__) . "/item/item_base.php";
class ObApiClient
{

    //支持的API类型
    public $apis = array(
        'taobao',
        '1688',
        'amazon',
        'jd',
        'mls',
        'ebay',
        'aliexpress',
        'dangdang',
        'suning',
        'biyao',
        'vip',
        'translate',
        'alimama',
        'alibaba',
        'kaola',
        'ymatou',
        'mic',
        'lazada',
        'vancl',
        'vvic',
        'mogujie',
        'weixin',
        'yiwugo',
        'shopee',
        'douyin',
    );
    public $items       = array();
    public $api_url     = '';
    public $api_urls    = array(); //备用API服务器
    public $api_urls_on = false; //当网络错误时，是否启用备用API服务器
    public $api_key     = '';
    public $api_secret  = '';
    public $api_version = ''; //API版本
    public $cache       = true; //要求更新缓存
    public $cache_local = true; //本地是否也缓存
    public $cache_db    = false; //是否缓存数据到本地数据库

    public $cache_obj  = null; //缓存类
    private $debug_obj = null; //调试类

    public $lang            = 'cn'; //返回数据语言(translate不支持使用此参数)
    public $desc_lang       = 'cn'; //返回数据描述语言，因描述文字较长，一般不翻译
    public $prop_lang       = 'cn'; //返回数据规格语言，与lang相同即可
    public $source_data     = false; //返回翻译之前的数据
    public $translateRemote = true; //使用远程翻译服务.为false时使用本地翻译
    public $translate_obj   = null;
    public $guest_ip        = null; //浏览者IP
    public $guest_host      = null; //域名
    public $guest_url       = null; //URL
    public $allow_spider    = false; //是否允许搜索引擎访问无缓存的API
    public $secache_path    = 'runtime/secache/'; //本地缓存路径
    public $secache_time    = 86400; //本地缓存时间（秒）
    public $secache_name    = 'option_data'; //本地缓存文件名
    public $use_ip          = null;
    public $error           = null; //出错信息
    public $call_args       = null;
    public $api_args        = null;
    public $api_name        = null;
    public $api_name_alias  = array(
        'item_get'              => 'get_taobao_item',
        'item_review'           => 'get_taobao_item_review',
        'item_fee'              => 'get_taobao_item_fee',
        'seller_info'           => 'get_taobao_seller_info',
        'item_search'           => 'taobao_item_search',
        'item_search_shop'      => 'taobao_item_search_shop',
        'cat_get'               => 'get_taobao_cat',
        'cat_son'               => 'get_taobao_cat_son',
        'item_search_samestyle' => 'get_samestyle_items',
        'item_search_similar'   => 'get_similar_items',
        'item_sku'              => 'get_taobao_sku',
        'brand_cat'             => 'get_brand_cat',
        'brand_cat_top'         => 'get_brand_cat_top',
        'brand_cat_list'        => 'get_brand_cat_list',
        'brand_keyword_list'    => 'get_brand_keyword_list',
        'brand_info'            => 'get_brand_info',
        'brand_product_list'    => 'get_brand_product_list',

    );
    // var $taobaoke_cat = false; //@todo 本站是否是淘宝客的分类ID
    // var $taobaoke_cats = array(
    //     50011404 => 50099718
    // );
    public $filter = '';
    public $m_curl;
    public $api_text;
    public $api_data;
    public $api_l_data;
    public $api_l_status;
    public $api_db_data;
    public $debug    = false; //0不调试，默认2：详细模式，1：简略模式,3:显示最近的错误日志
    public $log_file = ''; //api log 文件
    public $log_dir = '';//api log 文件
    public $request_id = '';//HTTP 请求的唯一

    // public $appKey;

    // public $secretKey;

    // public $gatewayUrl = "http://api.onebound.cn/"; //taobao/api_call.php

    public $format = "json";

    // //* 是否打开入参check*
    // //public $checkRequest = true;

    protected $signMethod = "md5";

    // protected $apiVersion = "2.0";

    // protected $sdkVersion = "obapi-sdk-php-20120822";

    public function __construct()
    {
        $this->cache_obj               = new ObApiCache($this);
        $this->cache_obj->secache_path = $this->secache_path;
        $this->helper_obj              = new ObApiHelper($this);
    	$this->log_obj = new ObApiLog($this);
    	$this->request_id = uniqid();

    	//自动检测可支持的api类型
    	$apis = scandir(dirname(__FILE__) . '/item/');
    	foreach($apis as $api){
    		if(strpos($api,'.php')!==false&&$api!='item_base.php'){
    			$this->apis[]=str_replace('.php','',$api);
    		}
    	}
    	$this->apis = array_unique($this->apis);
    }
    public function secache()
    {
        return $this->cache_obj->secache();
    }
    public function set_db_config($config)
    {
        $this->cache_db = true;
        $this->cache_obj->set_db_config($config);
    }
    public function set_log_db_config($config)
    {
        $this->log_obj->set_db_config($config);
    }
    private function cache_from_db()
    {
       return $this->cache_obj->cache_from_db();
    }
    private function cache_to_db()
    {
        $this->cache_obj->cache_to_db();
    }
    public function translate()
    { //$fun,$pram_arr=null)
        if (!$this->translate_obj) {
            $this->translate_obj            = new ObApiTranslate($this);
            $this->translate_obj->lang      = $this->lang;
            $this->translate_obj->prop_lang = $this->prop_lang;
            $this->translate_obj->desc_lang = $this->desc_lang;

        }
        // return call_user_func_array(array($this->translate_obj,$fun), $pram_arr);
        return $this->translate_obj;
    }
    /**
     * 获取来访IP地址
     */
    final public static function ip($outFormatAsLong = false)
    {
        if (isset($HTTP_SERVER_VARS['HTTP_X_FORWARDED_FOR'])) {
            $ip = $HTTP_SERVER_VARS['HTTP_X_FORWARDED_FOR'];
        } elseif (isset($HTTP_SERVER_VARS['HTTP_CLIENT_IP'])) {
            $ip = $HTTP_SERVER_VARS['HTTP_CLIENT_IP'];
        } elseif (isset($HTTP_SERVER_VARS['REMOTE_ADDR'])) {
            $ip = $HTTP_SERVER_VARS['REMOTE_ADDR'];
        } elseif (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = $_SERVER['HTTP_X_FORWARDED_FOR'];
        } elseif (isset($_SERVER['HTTP_CLIENT_IP'])) {
            $ip = $_SERVER['HTTP_CLIENT_IP'];
        } elseif (isset($_SERVER['REMOTE_ADDR'])) {
            $ip = $_SERVER['REMOTE_ADDR'];
        } else {
            $ip = '0.0.0.0';
        }

        if (isset($_SERVER['HTTP_X_1GB_CLIENT_IP'])) {
            $ip = $_SERVER['HTTP_X_1GB_CLIENT_IP'];
        }

        // 有时候获取两个IP
        // 前一个是实际IP，后一个是本地局域网
        // string(24) "220.172.11.231, 10.3.0.4"
        if (strrpos(',', $ip) >= 0) {
            $ip = explode(',', $ip, 2);
            $ip = current($ip);
        }

        //$ip=explode('.', $ip);
        //return ($ip[0]<<24)|($ip[1]<<16)|($ip[2]<<8)|$ip[3];
        return $outFormatAsLong ? ip2long($ip) : $ip;
    }

    /**
     *    判断是否为搜索引擎蜘蛛
     *
     *    @author    Eddy
     *    @return    bool
     */
    public function isSpider()
    {
        if(!isset($_SERVER['HTTP_USER_AGENT'])){
            return false;
        }
        $agent = strtolower($_SERVER['HTTP_USER_AGENT']);
        if (!empty($agent)) {
            $spiderSite = array(
                "TencentTraveler",
                "Baiduspider",
                "BaiduGame",
                "Googlebot",
                "msnbot",
                "Sosospider+",
                "Sogou web spider",
                "ia_archiver",
                "Yahoo! Slurp",
                "YoudaoBot",
                "Yahoo Slurp",
                "MSNBot",
                "Java (Often spam bot)",
                "BaiDuSpider",
                "Voila",
                "Yandex bot",
                "BSpider",
                "twiceler",
                "Sogou Spider",
                "Speedy Spider",
                "Google AdSense",
                "Heritrix",
                "Python-urllib",
                "Alexa (IA Archiver)",
                "Ask",
                "Exabot",
                //"Custo",
                "OutfoxBot/YodaoBot",
                "yacy",
                "SurveyBot",
                "legs",
                "lwp-trivial",
                "Nutch",
                "StackRambler",
                "The web archive (IA Archiver)",
                "Perl tool",
                "MJ12bot",
                "Netcraft",
                "MSIECrawler",
                "WGet tools",
                "larbin",
                "Fish search",
        		'bingbot',//Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)
        		'YandexBot',
        		'AhrefsBot',//Mozilla/5.0 (compatible; AhrefsBot/6.1; +http://ahrefs.com/robot/)
        		'Googlebot',//Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)
        		'MJ12bot',
        		'DotBot',//Mozilla/5.0 (compatible; DotBot/1.1; http://www.opensiteexplorer.org/dotbot, help@moz.com)
        		'semrush',//Mozilla/5.0 (compatible; SemrushBot/3~bl; +http://www.semrush.com/bot.html)
        		'YisouSpider',//Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.81 YisouSpider/5.0 Safari/537.36
        		// 'Firefox',//测试
            );

            if (strpos($agent, 'spider') !== false) {
                return true;
            }

            foreach ($spiderSite as $val) {
                $str = strtolower($val);
                if (strpos($agent, $str) !== false) {
                    return true;
                }
            }
        } else {
            return false;
        }
    }
    /**
     * 处理API请求和缓存
     * @param $api_name string 调用的API名称
     * @param $args array 调用的API参数列表
     *
     * @return array 返回结果数组
     */
    public function TBI($api_name, $args)
    {

    }

    /**
     * 获取API原始数据
     * @param $api_name string 调用的API名称
     * @param $args array 调用的API参数列表
     *
     * @return array 返回结果数组
     */
    public function curl($url, $post = null)
    {
        if ($this->isSpider() && $this->allow_spider == false) {
            $this->error = 'OBAPI:Spider deny!';
            return '';
            //return array('error'=>'spider deny!');
        }

        $log = date('Y-m-d H:i:s') . "\t" . $this->guest_ip . "\t" . $this->guest_url . "\t" . $_SERVER['HTTP_USER_AGENT'] . "\r\n";
        //file_put_contents('runtime/logs/api-'.$this->ip().'.log',$log,FILE_APPEND);

        $this->m_curl = new curl($url); //$_url 访问的URL
        $this->m_curl->setopt(CURLOPT_RETURNTRANSFER, 1);
        $this->m_curl->setopt(CURLOPT_TIMEOUT, 15);
        $this->m_curl->setopt(CURLOPT_HEADER, 0);
        //$this->m_curl->setopt(CURLOPT_FOLLOWLOCATION, 1);
        if ($post) {

            if (is_array($post)) {
                $post = http_build_query($post);
            }

            $this->m_curl->setopt(CURLOPT_POST, 1);
            $this->m_curl->setopt(CURLOPT_POSTFIELDS, $post);

        }

        $this->m_curl->setopt(CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_0);     
        $this->m_curl->setopt(CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        $this->m_curl->setopt(CURLOPT_SSL_VERIFYHOST,FALSE);
        $this->m_curl->setopt(CURLOPT_SSL_VERIFYPEER,FALSE);

        $data = $this->m_curl->exec();
        //$info = curl_getinfo($ch);
        if ($this->m_curl->m_status['errno']) {
            $html        = "";
            $this->error = '#' . $this->m_curl->m_status['errno'] . ':' . $this->m_curl->m_status['error'];
            $log         = print_r(array('date' => date('Y-m-d H:i:s'), 'url' => $url, 'error' => $this->error), true);
            //@file_put_contents(DIR_ERROR.'tbi_curl_'.date('Ymd').'.txt',$log."\r\n",FILE_APPEND);
        }
        if ($this->m_curl->m_status['http_code'] != '200') {
            $this->error = 'http_code:' . $this->m_curl->m_status['http_code'];
        }
        //

        if (!$data && $this->m_curl->m_status['http_code'] == 0 && $this->m_curl->m_status['download_content_length'] == 0) {
            $data = file_get_contents($url);
        }

        return $data;
    }
    /**
     * 获取跳转网址
     */
    public function file_get_rurl()
    {
        $url = '';

        if (!empty($this->m_curl->m_header["location"])) {
            $this->m_curl->m_header["Location"] = $this->m_curl->m_header["location"];
        }

        if (!empty($this->m_curl->m_header["Location"]) || strpos($html, 'location:') !== false || strpos($html, 'Location:') !== false) {

            if (!empty($this->m_curl->m_header["Location"])) {

                $url = $this->m_curl->m_header["Location"][0];
            } else {

                if (strpos($html, 'Location:') !== false) {
                    $url = explode('Location: ', $html);
                } else {
                    $url = explode('location: ', $html);
                }

                $url = explode("\r\n", $url[1]);
                $url = $url[0];
            }
        }

        if (!$url) {
            if (!empty($this->m_curl->m_status["redirect_url"])) {
                $url = $this->m_curl->m_status["redirect_url"];

            }
        }

        return $url;
    }

    public function API_debug()
    {
        $this->helper_obj->debug();
    }
    public function API_view()
    {
        $this->log_obj->view();
    }
    /**
     * $str 原始中文字符串
     * $encoding 原始字符串的编码，默认GB2312
     * $prefix 编码后的前缀，默认"\\u"
     * $postfix 编码后的后缀，默认""
     */
    public function unicode_encode($str, $encoding = 'GB2312', $prefix = '\\u', $postfix = '')
    {
        $str    = iconv($encoding, 'UCS-2', $str);
        $arrstr = str_split($str, 2);
        $unistr = '';

        cachd_db_funtion($type, $json);
        for ($i = 0, $len = count($arrstr); $i < $len; $i++) {
            $dec = hexdec(bin2hex($arrstr[$i]));
            $unistr .= $prefix . $dec . $postfix;
        }
        return $unistr;
    }

   /**
    * 根据密钥生成HASH
    * @param $secret_key string MD5加密后的密钥
    * @param $parameters array 请求参数数组
    */
    private function generate_hash($secret_key,$parameters)
    {
        unset($parameters['secret']);//如果参数里有secret值，不参与运算
        unset($parameters['sign']);//如果参数里有sign值，不参与运算
        ksort($parameters);//按键名对数组进行排序
        $appendAmp=0;    
        $parametersToHash=""; //用于拼接用的字符串
        foreach ($parameters as $key => $value) {        
            if (strlen($value) > 0 && "@" != substr($value, 0, 1) ) {
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

    protected function generate_sign($secret_key,$params)
    {
        unset($params['secret']);//如果参数里有secret值，不参与运算
        unset($params['sign']);//如果参数里有sign值，不参与运算
        ksort($params);

        $stringToBeSigned = $secret_key;
        foreach ($params as $k => $v) {
            if ("@" != substr($v, 0, 1)) {
                $stringToBeSigned .= "$k$v";
            }
        }
        unset($k, $v);
        $stringToBeSigned .= $secret_key;

        return strtoupper(md5($stringToBeSigned));
    }
    public function mb_unserialize($serial_str)
    {
        $out = preg_replace('!s:(\d+):"(.*?)";!se', "'s:'.strlen('$2').':\"$2\";'", $serial_str);
        return unserialize($out);
    }

    public function execute($request, $session = null)
    {
        static $execute_n = 0;
        static $curl_n    = 0;

        // if($this->checkRequest) {
        //     try {
        //         $request->check();
        //     } catch (Exception $e) {
        //         $result->code = $e->getCode();
        //         $result->msg = $e->getMessage();
        //         return $result;
        //     }
        // }

        if ($request) {
            $this->api_params = $request;
        }

        //$this->call_args = $args;

        //组装系统参数
        $sysParams["key"] = $this->api_key;
        //$sysParams["v"] = $this->apiVersion;
        if ($this->format != 'json') {
            $sysParams["result_type"] = $this->format;
        }

        $sysParams["sign_method"] = $this->signMethod;
        $sysParams["api_name"] = $this->api_name;
        $sysParams["dateline"] = date("Y-m-d H:i:s");
        //$sysParams["partner_id"] = $this->sdkVersion;
        if (null != $session) {
            $sysParams["session"] = $session;
        }

        //获取业务参数
        $apiParams = $this->api_params;
        $sysParams = array_merge($sysParams, $apiParams);
        if (!empty($sysParams["lang"])) {
            $this->lang = $sysParams["lang"];
            unset($sysParams["lang"]);
        }
        if (!empty($sysParams["desc_lang"])) {
            $this->desc_lang = $sysParams["desc_lang"];
            unset($sysParams["desc_lang"]);
        }
        if (!empty($sysParams["prop_lang"])) {
            $this->prop_lang = $sysParams["prop_lang"];
            unset($sysParams["prop_lang"]);
        }

  
    
      

        $sysParams["guest_ip"] = $this->ip();
        //$sysParams["guest_host"] = $_SERVER['HTTP_HOST'];
        //$sysParams["guest_url"] = isset($_SERVER['REDIRECT_SCRIPT_URL'])?$_SERVER['REDIRECT_SCRIPT_URL']:$_SERVER['REQUEST_URI'];
        // $this->api_args = '';
        // $this->api_args.= '?key='.$this->api_key;
        // $this->api_args.= '&version='.$this->api_version;
        // $this->api_args.= '&api_name='.$api_name;

        if (!$this->cache) {
            $sysParams["cache"] = 'no';
        }

        if ($this->source_data) {
            $sysParams["source_data"] = 'yes';
        }

        if ($this->translateRemote) {
            if (!$this->lang != 'cn' && !isset($sysParams["lang"])) {
                $sysParams["lang"] = $this->lang;
            }

            if (!$this->desc_lang != 'cn' && !isset($sysParams["desc_lang"])) {
                $sysParams["desc_lang"] = $this->desc_lang;
            }

            if (!$this->prop_lang != 'cn' && !isset($sysParams["prop_lang"])) {
                $sysParams["prop_lang"] = $this->prop_lang;
            }

        } else {
            if (!empty($sysParams['q']) && strpos($sysParams['q'], '_') === 0) {
                $q = explode('_', $sysParams['q']);
                $q = $this->translate()->translate_default($q[2], $q[1], 'cn');
                if ($q) {
                    $sysParams['q'] = $q;
                }

            }
        }

        //if($this->api_secret) $this->api_args .= '&secret='.$this->api_secret;
        //if($this->guest_ip) $this->api_args .= '&guest_ip='.$this->guest_ip;
        //if($this->guest_host) $this->api_args .= '&guest_host='.$this->guest_host;
        //if($this->guest_url) $this->api_args .= '&guest_url='.urlencode($this->guest_url);

 
       // $sysParams["sign"]   = $this->generate_sign($this->api_secret,$sysParams);
        $secret_key = $this->api_secret;
        if(strlen($secret_key)!=32) $secret_key=md5($secret_key);
        $sysParams["sign"]   = $this->generate_hash($secret_key,$sysParams);
        // 使用明文传递密钥的方式（不推荐）
        // $sysParams["secret"] = $this->api_secret;

        //系统参数放入GET请求串
        $requestUrl = $this->api_url . '/' . $this->api_type . '/'.$sysParams['api_name'].'?key='.$sysParams['key'].'&';
       
        // $requestUrl .= 'api_name='.$sysParams["api_name"].'&';
        // $requestUrl .= 'key='.$sysParams["key"].'&';//GET参数必须包括KEY和API_NAME

        ////
        //$requestUrl = $this->api_url . "/" . $this->api_type . '/'.$sysParams["api_name"].'?';
        //$requestUrl .= 'key='.$sysParams["key"].'&';//GET参数必须包括KEY和API_NAME

        $post       = '';
        $post2log       = '';
        foreach ($sysParams as $sysParamKey => $sysParamValue) {
            $post .= "$sysParamKey=" . urlencode($sysParamValue) . "&";
            $post2log .= "$sysParamKey=" . substr(urlencode($sysParamValue),0,255) . "&";
        }
        $post = substr($post, 0, -1);

        //发起HTTP请求
        try
        {
            $mtime      = explode(' ', microtime());
            $time_start = $mtime[1] + $mtime[0];

            $this->m_curl       = null;
            $this->api_text     = '';
            $this->api_l_data   = '';
            $this->api_db_data  = '';
            $this->api_data     = '';
            $this->api_l_status = '';
            $this->error        = '';
            $result             = null;
            $data               = null;
            if ($this->cache_db) {
                $data = $this->cache_from_db();
            }

            if ($data) {
                $result = $data;
            }
            //没有从数据库中读取到数据，本地也不使用缓存，直接从远程获取数据
            if (!$data && !$this->cache_local) {
                $data = $this->curl($requestUrl, $post);
                if ($data) {
                    $result = json_decode($data, true);
                }

                $curl_n++;
            }
            if (!$data && $this->cache_local) {
                $key = md5($this->api_name . '_' . implode(',', $this->api_params));
                if ($this->cache) {
                    $this->secache()->fetch($key, $data);
                    if ($data) {
                        $result             = unserialize($data);
                        $this->api_l_data   = $result;
                        $this->api_l_status = is_array($result)
                        && !empty($result['l_secache_time'])
                        && (time() - $result['l_secache_time']) < $this->secache_time
                        && $this->cache_local;
                    }
                }

                if ($this->api_l_status) {

                } else {

                    $data = $this->curl($requestUrl, $post);
                    $curl_n++;

                    $this->api_text = $data;
                    $result         = json_decode($data, true);
                    if (!$result) {
                        $this->error = 'Error JSON data format:' . htmlspecialchars($data);
                    } else {
                        $mtime                 = explode(' ', microtime());
                        $result['l_down_time'] = round(($mtime[1] + $mtime[0]) - $time_start, 5);
                    }

                    if ($this->m_curl->m_status['errno']) {
                        $this->error .= 'network error:' . $this->m_curl->m_status['errno'] . '#' . $this->m_curl->m_status['error'];
                    }
                    if ($this->m_curl->m_status['http_code'] != '200') {
                        $this->error .= 'http_code error:' . $this->m_curl->m_status['http_code'];
                    }
                    if (!empty($result['error'])) {
                        $this->error .= $result['error'];
                    } else {
                        $result['error'] = '';
                    }

                    

                    if ($this->translateRemote == false) {
                        $result = $this->translate()->translate($this->api_name, $result);
                    }
                    //||in_array($result['error'],array('off-sale'))
                    if (is_array($result) && !empty($result['server_time']) && empty($result['error'])) {
                        $result['l_secache']      = $key;
                        $result['l_secache_time'] = time();
                        $result['l_secache_date'] = date('Y-m-d H:i:s');
                        $this->secache()->store($key, serialize($result));
                    } else {
                        if (empty($result['error'])) {
                            if ($this->error) {
                                $result['error'] = $this->error;
                            } else {
                                $result['error'] = 'data error,no cache';
                            }

                        }
                    }

                }

                $result['l_cache'] = !empty($result['l_secache_time']) && time() - $result['l_secache_time'] > 5 ? 1 : 0;

                //return $result;

            }

            $mtime = explode(' ', microtime());

            $result['l_execution_time'] = round(($mtime[1] + $mtime[0]) - $time_start, 5);
            $this->API_access_log("----API(" . $execute_n . "-" . $curl_n . ")" . ($this->api_l_status ? '-ok-' : '----') . "(" . $result['l_execution_time'] . "-" . $this->helper_obj->get_use_time(true) . "):" . $this->api_name . " " . $post2log);
        	 //ip,api_server,api_type,api_key,api_name,request,use_time,error,cache
        	$guest_post    = (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST') ? $_POST : null;
        	if(!$guest_post) {
        	    $guest_post = file_get_contents("php://input");
        	    if($guest_post) $guest_post =  'INPUT:'.$guest_post;
        	}else{
        		$guest_post = json_encode($guest_post);
        	}
        	$guest_agent   = $_SERVER["HTTP_USER_AGENT"];
        	$guest_url = '';
        	if(isset($_SERVER['REDIRECT_SCRIPT_URL'])){
        		$guest_url = $_SERVER['REDIRECT_SCRIPT_URL'];
        		if(isset($_SERVER['REDIRECT_QUERY_STRING'])){
        			$guest_url .= '?' . $_SERVER['REDIRECT_QUERY_STRING'];
        		}
        	}elseif($_SERVER['REQUEST_URI']){
        		$guest_url .=  $_SERVER['REQUEST_URI'];
        	}
        	if($guest_url=='/'){
        		$guest_url.='GET:'.json_encode($_GET);
        	}

        	$guest_referer = !empty($_SERVER['HTTP_REFERER'])?$_SERVER['HTTP_REFERER']:'';

        	$this->API_db_log(array(
        	 	'log_date'=>date('Y-m-d'),
        	 	'log_time'=>date('H:i:s'),
        	 	'server_ip'=>$_SERVER['SERVER_ADDR'],
        	 	'api_server'=>$this->api_url,
        	 	'api_type'=>$this->api_type,
        	 	'api_key'=>$this->api_key,
        	 	'api_secret'=>$this->api_secret,
        	 	'api_lang'=>$this->lang,
        	 	'api_name'=>$this->api_name,
        	 	'api_request'=>$post2log,
        	 	'api_result'=>$this->api_text,
        	 	'guest_ip'=>$this->ip(),
        	 	'guest_host'=>$_SERVER['HTTP_HOST'],
        	 	'guest_agent'=>$guest_agent,
        	 	'guest_post'=>$guest_post,
        	 	'guest_url'=>$guest_url,
        	 	'guest_referer'=>$guest_referer,
        			 	
        	 	'use_time'=>$result['l_execution_time'],
        	 	'error'=>$this->error,
        	 	'cache'=>!empty($result['l_cache'])?$result['l_cache']:0,
        	 	'request_id'=>$this->request_id,

        	 ));

            $this->api_data = $result;
            if ($this->cache_db && !$this->api_db_data) {
                $this->cache_to_db();
            }

            if ($this->debug) {
                $this->API_debug();
            }

            $this->API_log(substr(json_encode($this->api_data), 0, 200));
            if ($this->error) {
                $this->API_log($requestUrl . ',Post:' . $post2log . 'Error:' . $this->error, true);
                if (strpos($this->error, 'Error JSON data format:') !== false) {
                    if ($this->api_l_data) {
                        $result = $this->api_l_data;
                    }

                }
                if ($this->api_urls_on && $this->api_urls) {

                    if (strpos($this->error, 'network error') !== false || strpos($this->error, 'http_code error') !== false) {
                        $this->api_url = array_pop($this->api_urls);
                        return $this->execute($request, $session);
                    }
                }

            }

            //$resp = $this->curl($requestUrl, $apiParams);
        } catch (Exception $e) {
            //    $this->logCommunicationError($sysParams["method"],$requestUrl,"HTTP_ERROR_" . $e->getCode(),$e->getMessage());
            //$result->code = $e->getCode();
            //$result->msg = $e->getMessage();
            //return $result;
        }

        // //解析TOP返回结果
        // $respWellFormed = false;
        // if ("json" == $this->format)
        // {
        //     $respObject = json_decode($resp);
        //     if (null !== $respObject)
        //     {
        //         $respWellFormed = true;
        //         foreach ($respObject as $propKey => $propValue)
        //         {
        //             $respObject = $propValue;
        //         }
        //     }
        // }
        // else if("xml" == $this->format)
        // {
        //     $respObject = @simplexml_load_string($resp);
        //     if (false !== $respObject)
        //     {
        //         $respWellFormed = true;
        //     }
        // }

        // //返回的HTTP文本不是标准JSON或者XML，记下错误日志
        // if (false === $respWellFormed)
        // {
        //     //$this->logCommunicationError($sysParams["method"],$requestUrl,"HTTP_RESPONSE_NOT_WELL_FORMED",$resp);
        //     //$result->code = 0;
        //     //$result->msg = "HTTP_RESPONSE_NOT_WELL_FORMED";
        //     return $result;
        // }

        // //如果TOP返回了错误码，记录到业务错误日志中
        // if (isset($respObject->code))
        // {
        //     // $logger = new LtLogger;
        //     // $logger->conf["log_file"] = rtrim(TOP_SDK_WORK_DIR, '\\/') . '/' . "logs/top_biz_err_" . $this->appkey . "_" . date("Y-m-d") . ".log";
        //     // $logger->log(array(
        //     //     date("Y-m-d H:i:s"),
        //     //     $resp
        //     // ));
        // }
        $execute_n++;
        return $result;
    }

    public function exec($paramsArray)
    {
        $this->error = '';
        if (!isset($paramsArray["api_type"]) || !in_array($paramsArray["api_type"], $this->apis)) {
            trigger_error("No api type passed");
            $this->error = "No api type passed";
        }
        if (!isset($paramsArray["api_name"])) {
            trigger_error("No api name passed");
            $this->error = "No api name passed";
        }

        if ($this->error) {
            return array(
                'error' => $this->error,
            );
        }
        $session = '';
        $req     = $paramsArray['api_params'];

        $this->api_type = $paramsArray['api_type'];
        $this->api_name = $paramsArray['api_name'];

        if (in_array($this->api_name, $this->api_name_alias)) {
            $this->api_name = array_search($this->api_name, $this->api_name_alias);
        }

        return $this->execute($req, $session);
    }

    public function item($item)
    {
        if (!$this->items[$item]) {
            $file = dirname(__FILE__) . '/item/' . $item . '.php';
            if (!file_exists($file)) {
                throw new Exception($item . ' item file miss!', 1);

            }
            include_once $file;
            $item_class         = 'item_' . $item;
            $this->items[$item] = new $item_class;
        }
        return $this->items[$item];
    }
	public function API_db_log($log)
	{
		$this->log_obj->write($log);

	}
    public function API_access_log($log)
    {
        if ($this->log_file) {
            $this->helper_obj->log($log, $this->log_file);
        }

    }
    public function API_log($log, $is_error = null)
    {
        if ($this->log_file) {
            $log_file = $this->log_file . '=' . $this->api_type . '-' . $this->api_name . ($is_error ? '_error' : '') . '.log';
            $log      = $this->ip() . ' ' . date('Y-m-d H:i:s') . "\r\nPARAMS:" . print_r($this->api_params, true) . "\r\nLOG:" . $log . "\r\n";
            $this->helper_obj->log($log, $log_file);

        }
    }



}
