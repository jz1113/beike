<?php

class SignYour
{
	public static function detect_encoding($text){
		$charsets = array("UTF-8","GB2312","GBK","BIG5","ASCII","EUC-JP",'KOI8-R',"Shift_JIS","CP936","ISO-8859-1","JIS","eucjp-win","sjis-win");
		$encode = (mb_detect_encoding($text, $charsets));
		return $encode;
	}
	public static function strlen()
	{
		static $func = null;
		if (is_null($func)) {
			
			$func = 'strlen';
			if (function_exists('mb_strlen')) {
				$func = 'mb_strlen';
			}else if (function_exists('iconv_strlen')) {
				$func = 'iconv_strlen';
			}
		
		}
	
		$args = func_get_args();
		$encode = self::detect_encoding($args[0]);
		$args[1] = $encode;
	
		return call_user_func_array($func, $args);
	}
	public static function substr()
	{
		static $func = null;
		if (is_null($func)) {
			
			$func = 'substr';
			if (function_exists('mb_substr')) {
				$func = 'mb_substr';
			}else if (function_exists('iconv_substr')) {
				$func = 'iconv_substr';
			}


		}
		$args = func_get_args();
		$encode = self::detect_encoding($args[0]);
		
		$args[3] = $encode;

		return call_user_func_array($func, $args);
	}
	public static function ord($str, $offset=false)
	{
		if (!$offset) $offset = 0;
		return self::ordutf8($str, $offset);
	}
	private static function ordutf8($string, &$offset)
	{
	    $code = ord(substr($string, $offset,1)); 
	    if ($code >= 128) {        //otherwise 0xxxxxxx
	        if ($code < 224) $bytesnumber = 2;                //110xxxxx
	        else if ($code < 240) $bytesnumber = 3;        //1110xxxx
	        else if ($code < 248) $bytesnumber = 4;    //11110xxx
	        $codetemp = $code - 192 - ($bytesnumber > 2 ? 32 : 0) - ($bytesnumber > 3 ? 16 : 0);
	        for ($i = 2; $i <= $bytesnumber; $i++) {
	            $offset ++;
	            $code2 = ord(substr($string, $offset, 1)) - 128;        //10xxxxxx
	            $codetemp = $codetemp*64 + $code2;
	        }
	        $code = $codetemp;
	    }
	    $offset += 1;
	    if ($offset >= strlen($string)) $offset = -1;
	    return $code;
	}
	public static function unsignedRightShift($a, $b)
    {
        return (
            $a >= 0
            ? $a >> $b
            : (($a & 0x7fffffff) >> $b) | (0x40000000 >> ($b - 1))
        );
    }
    public static function charAt($a,$i)
    {
	    return self::substr($a,$i,1);
	}
}
class Yourcode
{
	public static $C = null;
	public static function a($R,$O) {
		$ol = SignYour::strlen($O);
		for($t = 0; $t < $ol;$t += 3) {
			$a = $O{$t + 2};
			$a = (strcmp($a, "a") >= 0) ? SignYour::ord($a) - 87 : intval($a);
			$a = '+' === $O{$t + 1} ? SignYour::unsignedRightShift($R, $a) : $R << $a;
			$R = '+' === $O{$t} ? $R + $a & 4294967295 : $R ^ $a;
		}
		return $R;
	}
	public static function hash($r, $_gtk) 
	{
		$o = SignYour::strlen($r);
	
		if ($o > 30) {
			$c1 = SignYour::substr($r, 0 , 10);
			$c2 = floor($o / 2) - 5;
			$c3 = SignYour::substr($r, $c2 , 10);
			$c4 = SignYour::substr($r, -10 , 10);
			$r = "{$c1}{$c3}{$c4}";
		}
		$r_len = SignYour::strlen($r);
		
		if (Yourcode::$C === null) {
			Yourcode::$C = $_gtk;
		}
		$t = Yourcode::$C !== null ? Yourcode::$C : "";
		$e = explode(".", $t);
		$h = intval($e[0]);
		if (!$h) $h = 0;
		$i = intval($e[1]);
		if (!$i) $i = 0;	
		$d = array();//[];
		$f = 0;
		$g = 0;

		for (; $g < $r_len; $g ++) {
			$char = SignYour::charAt($r,$g);
	        $m = SignYour::ord($char);
	      
	        if (128 > $m) {
	        	$d[$f++] = $m;
	        }
	        else {
	        	if (2048 > $m) {
	        		$d[$f++] = $m >> 6 | 192;
	        	}
	        	else {
	        		$char0 = SignYour::charAt($r,$g+1);
	        		$rcode0 = SignYour::ord($char0);
	        		$xxx = 55296 === (64512 & $m) && $g + 1 < $r_len && 56320 === (64512 & $rcode0);
	        		if ($xxx) {
	        			$char1 = SignYour::charAt($r,++$g);
	        			$rcode1 = SignYour::ord($char1);
		        		$m = 65536 + ((1023 & $m) << 10) + (1023 & $rcode1);
					    $d[$f++] = $m >> 18 | 240;
					    $d[$f++] = $m >> 12 & 63 | 128;
	        		}
	        		else {
	        			$d[$f++] = $m >> 12 | 224;
	        		}
	        		$d[$f++] = $m >> 6 & 63 | 128;
	        	}
		        $d[$f++] = 63 & $m | 128;
		    }
		   
		}
		
		$S = $h;
		$u = "+-a^+6";
		$l = "+-3^+b+-f";
		$s = 0;
		for (; $s < count($d); $s++) {
			$S += $d[$s];
	        $S = Yourcode::a($S, $u);
	       
		}
	
		$S = (string) $S;
		$S = Yourcode::a($S, $l);
		$S ^= $i;
		if (0 > $S) {
			$S = (2147483647 & $S) + 2147483648;
		}
	    $S = bcmod("{$S}", 1e6);
	    $vvv = $S ^ $h;
	    $cc = (string) $S;
	    $gg = $cc . '.' . $vvv;
	    
		return $gg;
	}
}
// namespace Otc;
class Translator
{
    private $registry;
    private static $cn_codes = array('ZH', 'CN', 'ZH-CN', 'ZH_CN');
    private static $cn_code  = 'ZH-CN';
    private static $en_codes = array('EN', 'EN-GB');
    private static $en_code  = 'EN';
    private static $channels = array('google_free', 'google', 'baidu_free', 'baidu', 'baidu_old', 'microsoft', 'youdao_free', 'youdao');
    private $channel         = 'google_free';
    private $google_account;
    private $google_domain = 'cn';
    private $baidu_account;
    private $baidu_client_id;
    private $microsoft_account;
    private $microsoft_access_token;
    private $youdao_account;
    private static $ignores = array('XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL', '2XL', '3XL', '4XL', '5XL');
    private $text;
    private $target;
    private $source;
    private static $filter_keywords = array('【天猫超市】', '包邮', '★', '^@^', '◤', '◢');
    private $replace_keywords       = array();
    private $cache_expire           = 2592000;

    public $from;
    public $to;
    public $debug;
    public $use_cache;

    public function __construct()
    {
        // $this->registry = $registry;

        $replace_keywords = $this->getReplaceKeywords();
        if ($replace_keywords) {
            $this->setReplaceKeywords($replace_keywords);
        }
    }
    public function __get($name)
    {
        // return $this->registry->get($name);
    }
    public function set_account_config($config)
    {

        // $config['otao_translate_account']=array(
        //     'google'=>array(
        //         'domain'=>'cn',
        //         'api_key'=>'',
        //         'referer'=>'',
        //         ),
        //     'baidu'=>array(
        //         'app_id'=>'',
        //         'sec_key'=>'',
        //         'client_id'=>'',
        //         ),
        //     'microsoft'=>array(
        //         'client_id'=>'',
        //         'client_secret'=>'',
        //         ),
        //     'youdao'=>array(
        //         'api_key'=>'',
        //         'key_from'=>'',
        //         ),
        // );
        if (!empty($config['otao_translate_channel'])) {
            $this->setChannel($config['otao_translate_channel']);
        }

        if (!empty($config['otao_translate_account'])) {
            $account = $config['otao_translate_account'];
            // $account['google']['domain']='cn';
            //var_dump($account);
            if (!(empty($account['google']))) {
                $this->setGoogleAccount($account['google']['api_key'], $account['google']['referer']);
                $this->setGoogleDomain($account['google']['domain']);
            }
            if (!(empty($account['baidu']))) {
                $this->setBaiduAccount($account['baidu']['app_id'], $account['baidu']['sec_key']);
                $this->setBaiduClientId($account['baidu']['client_id']);
            }
            if (!(empty($account['microsoft']))) {
                $this->setMircrosoftAccount($account['microsoft']['client_id'], $account['microsoft']['client_secret']);
            }
            if (!(empty($account['youdao']))) {
                $this->setYoudaoAccount($account['youdao']['api_key'], $account['youdao']['key_from']);
            }
        }

    }
    public static function getCnCodes()
    {
        return self::$cn_codes;
    }
    public static function getCnCode()
    {
        return self::$cn_code;
    }
    public static function getEnCodes()
    {
        return self::$en_codes;
    }
    public static function getEnCode()
    {
        return self::$en_code;
    }
    private function getReplaceKeywords()
    {
        // $results = $this->cache->get('translate_replacements');
        // if (!($results))
        // {
        //     $query = $this->db->query('SELECT * FROM ' . DB_PREFIX . 'otao_translate_replace ORDER BY `id` DESC');
        //     $results = $query->rows;
        //     $this->cache->set('translate_replacements', $results);
        // }
        // if ($results)
        // {
        //     $sort_order = array();
        //     foreach ($results as $key => $result )
        //     {
        //         $sort_order[$key] = $result['sort_order'];
        //     }
        //     array_multisort($sort_order, SORT_ASC, $results);
        // }
        // return $results;
        // return $results;
    }
    public function setTranslator($channel)
    {
        self::setChannel($channel);
    }

    public function setChannel($channel)
    {
        if (in_array($channel, self::$channels)) {
            $this->channel = $channel;
        }
    }
    public function setGoogleAccount($api_key, $referer = false)
    {
        if ($api_key) {
            $this->google_account = array('api_key' => $api_key, 'referer' => $referer);
        }
    }
    public function setGoogleDomain($domain)
    {
        if ($domain) {
            $this->google_domain = trim($domain, '. ');
        }
    }
    public function setBaiduAccount($appid, $sec_key)
    {
        if ($appid && $sec_key) {
            $this->baidu_account = array('appid' => $appid, 'sec_key' => $sec_key);
        }
    }
    public function setBaiduClientId($client_id)
    {
        $this->baidu_client_id = $client_id;
    }
    public function setMircrosoftAccount($client_id, $client_secret)
    {
        $this->microsoft_account = array('client_id' => $client_id, 'client_secret' => $client_secret);
    }
    public function setMicrosoftAccessToken($accessToken)
    {
        $this->microsoft_access_token = $accessToken;
    }
    public function setYoudaoAccount($api_key, $key_from)
    {
        $this->youdao_account = array('api_key' => $api_key, 'key_from' => $key_from);
    }
    public function setSource($source)
    {
        $this->source = strtoupper($source);
        if (in_array($this->source, self::$cn_codes)) {
            $this->source = self::$cn_code;
        } else if (in_array($this->source, self::$en_codes)) {
            $this->source = self::$en_code;
        }
    }
    public function setTarget($target)
    {
        $this->target = strtoupper($target);
        if (in_array($this->target, self::$cn_codes)) {
            $this->target = self::$cn_code;
        } else if (in_array($this->target, self::$en_codes)) {
            $this->target = self::$en_code;
        }
    }
    public function setReplaceKeywords($replace_keywords)
    {
        $this->replace_keywords = $replace_keywords;
    }
    public function clearTranslateCache($text, $source, $target)
    {
        $this->setSource($source);
        $this->setTarget($target);
        $this->otc->_cache->delete('translation_' . md5($this->filter_text($text)) . '_' . $this->source . '_' . $this->target);
    }
    //public function translate_array($data)
    //{
    //   return $this->exec($data, $this->from, $this->to);

    //}


	public $_t_array_pre="|";//翻译数组分隔符
	public $_t_array_len=5000;//翻译数组最大字符
	public $_t_array_mode=0;//翻译数组最大字符模式，0字符长度 1数量

	/**
	* 是否是需要翻译的文字
	*/
	public function is_lang_text($text,$from=null,$to=null){
		$need_translate = true;


		$text = preg_replace('@[\s]+@is','',$text);//
		//纯数字
		if(is_numeric($text)) $need_translate = false;

		//纯符号
		if(preg_match('@^[￥\d\|\[\]\{\}\-=\+\(\)&%#\@\!￥$\.\s\r\n \?～]+$@isU',$text))$need_translate = false;
		//12cm 尺寸类
		if(preg_match('@^[\d\.]+[\w]+$@isU', $text))$need_translate = false;
		if(preg_match('@^[\w]+[\d]+$@isU', $text))$need_translate = false;
		//大写简称NBA,CCTV
		if(preg_match('@^[A-Z]{1,5}$@sU', $text))$need_translate = false;
		if(preg_match('@^[A-Z]{1,10}$@sU', $text))$need_translate = false;
		if(preg_match('@^[A-Z\&]{1,10}$@sU', $text))$need_translate = false;
		if(preg_match('@^[\d\.\s\{\}\[\];#%\$\:\/\(\\-\@\!\),\<\>\*’]$@isU', $text))$need_translate = false;
		//FAR.1984
		if(preg_match('@^[A-Z\&]{1,10}\.[\d]+$@sU', $text))$need_translate = false;
		//38,39,40,41,42,43,44,45,46,36,37
		//308-5
		if(preg_match('@^[\d,\.\-]+$@sU', $text))$need_translate = false;



		//3/4
	
		//LM336MX-2.5/NOPBA 926-LM336MX-25/NOPB
		//mx25l12835f
		//#07#08#09#10#01#03#05#06
		if($from=='zh-CN'){
			//中文状态下，纯属英文不翻译
			if(preg_match('@^[\w\d]+$@sU', $text))$need_translate = false;

			//不包括中文时
			$cn='\x{4e00}-\x{9fa5}';
			if(!preg_match('/['.$cn.']/u',$txt))$need_translate = false;

			//COOLYEP/酷易 品牌名不翻译

		}
	
		// echo "<br>":

		//		$str_cn = preg_replace('@[\w\d\.\s\{\}\[\];#%\$\:\/\(\\-\@\!\),\<\>\*’]+@is','',$str_cn);

//3939.5404141.5424343.5444546
//1-400 AM-L12		
		return $need_translate;
	}

		/**
	* 翻译一个数组内容,使用<hr>作为分割符
	* 
	*/
	function translate_array($array){
		$log_total =  strlen(join(",",$array));
		// if($this->debug){
		// 	if(!headers_sent()) header("Content-Type: text/html; charset=utf-8");
		// 	flush();
		// }


		// $this->from = self::chk_code($this->from);
		// $this->to = self::chk_code($this->to);
		// if($this->from ==$this->to)return $array;
		$this->_t_array_pre="\n";

		if($this->channel=='youdao'){

			$this->_t_array_pre="\r\n";//翻译数组分隔符
			$this->_t_array_len=5000;//翻译数组最大字符
			$this->_t_array_mode=0;

		}
		if($this->channel=='baidu'){

			$this->_t_array_pre="\r\n";//翻译数组分隔符
			$this->_t_array_len=5000;//翻译数组最大字符
			$this->_t_array_mode=0;

		}
		if($this->channel=='google'){
			$this->_t_array_pre="\n";
			$this->_t_array_len=100;
			$this->_t_array_mode=1;

		}	



		// $use_cache = $this->use_cache;
		// $this->use_cache = false;

		// $cache = $this->_init_secache();	

		$cache_arr=array();
		$array_need=array();
		$array_noneed=array();
		$array_needkey=array();

		//90-夏季透气男鞋子男士休闲防滑板鞋帆布鞋男跑步运动鞋韩版百搭潮鞋
		//标题一般不超过90个字符
		//36-洗护清洁剂/卫生巾/纸/香薰	
		//38-鲜花速递/花卉仿真/绿植园艺	
		$lang_v_max_len=90;
		//京东长度限制是
		if(!empty($GLOBALS['API_type']) && $GLOBALS['API_type']=='jd') $lang_v_max_len=160;
		if(!empty($_GET['tp']) && $_GET['tp']=='jd') $lang_v_max_len=160;

		//把不需要翻译的取出来
			foreach($array as $k=>$v){
				$array[$k] = $v;
				$is_lang_text = $this->is_lang_text($array[$k]);

				$isshort = strpos($array[$k],'###short###')===0;
				if($isshort) {//strlen($array[$k])>50||
					$array[$k] = str_replace('###short###','',$array[$k]);
					// $array[$k] = $this->get_tags($array[$k],$isshort);
				}
				
			 
				$value=null;
				// if($use_cache){
				// 	if($this->use_cache_type=='db'){

				// 		if($is_lang_text  && strlen($v)<=$lang_v_max_len) {
				// 			$db_cache = $this->get_cache($v,$this->from,$this->to);
				// 			if($db_cache)$value=$db_cache;
				// 		}
				// 	}else{

				// 		$key = md5($array[$k]);if(is_array($array[$k]))var_dump($array[$k]);
				// 		$cache->fetch($key,$value);
				// 		if(strlen($value)>10 && $value==$v)$value='';
				// 		if($value==-1)$value='';
				// 		$value=trim($value);

				// 	}
				
					

				// }
				//echo $key.'=>'.$v.'=>'.$value.'<br>';
				
				if($value||strlen($array[$k])==0|| !$is_lang_text){
					$cache_arr[$k]=$value;
					if(!$is_lang_text) {
						$array_noneed[$k]=$array[$k];
						$cache_arr[$k]=$array[$k];
					}
				}else{
					$array_need[]=$array[$k];
					$array_needkey[]=$k;
					$cache_arr[$k]=null;
				}
				
				
			}

			
			$pre='';
			$values='';
			$temps='';
			$value_length = count($array_need);
			
			$i=0;
			$array_needs=array();
			$array_needkeys = array();
			foreach($array_need as $k=>$v){
				//
				$len_limit = strlen($values . $pre . $v)>$this->_t_array_len;
				if($this->_t_array_mode){

					$len_limit = $array_needs&&count($array_needs[$i]) > $this->_t_array_len;
				 }

				//http://code.google.com/p/google-ajax-apis/issues/detail?id=273 长度限制条款
				if($k+1 == $value_length || $len_limit){//加上下一条达到该引擎翻译长度限制时(5000)，翻译前面的内容,清空再继续
					
						if($k+1 == $value_length ){
						 $values .= $pre.$v;

						$array_needs[$i][]=$v;
						$array_needkeys[$i][]=$array_needkey[$k];
					}
					$i++;
					$values='';
				}
				if($k+1 < $value_length ){
					$array_needs[$i][]=$v;
					$array_needkeys[$i][]=$array_needkey[$k];
					$values .= $pre.$v;
					$pre=$this->_t_array_pre;	
				}
			}

			$temps=array();
			$tempg=array();
			foreach($array_needs as $i=>$array_need){
				$values = implode($this->_t_array_pre,$array_need);
				$temp_values = $this->exec($values,$this->from,$this->to);
				$temp = explode($this->_t_array_pre,$temp_values);
				
				if(count($array_need)==count($temp)){//批量翻译成功
					foreach($array_need as $k=>$v){	
							$oldkey = $array_needkeys[$i][$k];
							//echo $i.'group#'. $oldkey .'=>'.$v.'=>'.$temp[$k].'<br>';
							$key = md5($v);
							$temp[$k] = trim($temp[$k]);

							$cache_arr[$oldkey] = $temp[$k];
							$temps[]=$temp[$k];
							$tempg[]=$i;
							
							// if($this->use_cache_type=='db'){
							// 	if(strlen($v)<=$lang_v_max_len && $v!=$temp[$k] &&$temp[$k]!='-1') $this->set_cache($v,$this->from,$this->to,$temp[$k]);
								
							// }else{
							// 	$cache->store($key,$temp[$k]);

							// }

					}
					
				}else{
					$error = 'not match';

					$temp = array();
					foreach($array_need as $k=>$v){
							if($temp_values==-1)$tv = $v;
							else $tv = $this->exec($v,$this->from,$this->to);

							if($tv==-1)$tv=$v;
							$oldkey = $array_needkeys[$i][$k];
							$temp[]=$tv;
							$cache_arr[$oldkey] = $temp[$k];
							$temps[]=$tv;
							$tempg[]=$i;
					}
				}
				
			}

			$log_real = 0;$log_error=0;
			foreach($array_needs as $v)$log_real +=strlen(join(',',$v));

			$temp_i=0; 

			foreach($array_needs as $i=>$array_need){	
		
				foreach($array_need as $k=>$v){		
					$vv = $temps[$k+$temp_i];
					if(($vv==''||$v==$vv)&&$this->is_lang_text($v)) $log_error +=strlen($v);
					
					
				}
				$log_real+=strlen(join(',',$array_need));
				$temp_i+=count($array_need);
			}
		
		
	/*	$this->use_cache =$use_cache;
		if($this->debug){
			if(!headers_sent()) header("Content-Type: text/html; charset=utf-8");
			ob_flush();
			echo '<style>fieldset{width:90%}</style>';
			echo '<div class="container debug_info" style="margin:5px 10px">';


			echo '<fieldset><legend>翻译引擎：'.$this->_use.':need:'.count($array_need).' real:'.count($temp).'</legend>';
			echo '使用缓存:'.$this->use_cache.'<br>';
			echo '类型缓存:'.$this->use_cache_type.'<br>';
			echo '缓存启动:'.$this->use_cache_init.'<br>';
			echo '<table  border="1" cellspacing="0" cellpadding="0"><tr><th></th><th valign="top" >原文('.$this->from.')</th><th>目标('.$this->to.')</th><th>缓存</th><th>不翻译</th></tr>';
			
			$length_count=0;
			foreach($array as $k=>$v){		
				$kk = array_search($k,$array_needkey);
				if($kk!==false) $vv = trim($temps[$kk]);
				else  $vv = '';
				
				$vvv = trim($cache_arr[$k]);
				if($vv)$vvv ='';

				$vvvv = $array_noneed[$k];
				
				//显示详细
				echo '<tr>';
				echo '<td valign="top" >';
				echo $k;
				echo '</td>';
				echo '<td valign="top" >';
				echo str_replace(array('<','>'),array('&lt;','&gt;'),$v);
				echo '</td><td valign="top" >';
				echo str_replace(array('<','>'),array('&lt;','&gt;'),$vv);
				echo '</td><td valign="top" >';
				echo str_replace(array('<','>'),array('&lt;','&gt;'),$vvv);
				echo '</td><td valign="top" >';
				echo str_replace(array('<','>'),array('&lt;','&gt;'),$vvvv);
				echo '</td></tr>';
				echo "\r\n";
				$length_count+=strlen($v);
			}
			echo '<tr><td></td><td>length:'.$length_count.'</td><td></td><td></td><td></td></tr>';
			
			echo '</table>';
			
			echo '</fieldset>';
			
			 echo '<fieldset><legend>实际翻译：'.count($array_need).':</legend>';
			 echo '<table  border="1" cellspacing="0" cellpadding="0"><tr><th></th><th valign="top" >原文('.$this->from.')</th><th>目标('.$this->to.')</th></tr>';
			$temp_i=0;
			$length_count=0;
			foreach($array_needs as $i=>$array_need){	
				echo '<tr>';
				echo '<th valign="top" >group:';
				echo $i;
				echo '</th>';
				echo '<th valign="top" >$array_need count:';
				echo count($array_need);
				echo ' Len:';
				echo strlen(implode($this->_t_array_pre,$array_need));
				echo '</th><th valign="top" >$temps:';
				
				echo '</th></tr>';
				echo "\r\n";	
				foreach($array_need as $k=>$v){		
					$vv = $temps[$k+$temp_i];
					echo '<tr>';
					echo '<td valign="top" >';
					echo $k;
					echo '</td>';
					echo '<td valign="top" >';
					echo strlen($v).'|'.str_replace(array('<','>'),array('&lt;','&gt;'),$v);
					echo '</td><td valign="top" >';
					echo strlen($vv).'|'.str_replace(array('<','>'),array('&lt;','&gt;'),$vv);
					echo '</td></tr>';
					echo "\r\n";
					$length_count+=strlen($v);
				}
				$temp_i+=count($array_need);
			}
			echo '<tr><td></td><td>Total length:'.$length_count.'</td><td></td></tr>';
			echo '</table>';
			echo '</fieldset>';
			
			echo '</div>';
			echo '$cache_arr';
			echo '<textarea style="width:100%" ondblclick="this.style.height=\'500px\'">';
			var_dump($cache_arr);
			echo '</textarea>'.'<br>';	



			$this->is_limits();

			 echo '<fieldset><legend>翻译日志:</legend>';
			//	$file=DIR_LOG.'translate_use_'.date('Y-m-d').'_'.$this->_use.'.log';
			$files = glob(DIR_LOG.'translate_use_*');
			if($files){
				$files2=array();
				foreach ($files as $k=>$f) {
					$g = date('Y-m-d',filemtime($f));
					$files2[$g][]=$f;
				}
				foreach ($files2 as $g=>$fs) {
						echo '<h2>'.$g.'-------------------------------------------</h2>';
					foreach ($fs as $k=>$f) {
						$c = file_get_contents($f);
						$j = json_decode($c,true);

						echo '<h3>'.$k.'#'.str_replace(DIR_LOG.'translate_use_', '', $f);
						echo ' <small>'.date('H:i:s',filemtime($f)).'</small></h3>';
						// dump($j);
						// $this->ocurl->out_data($j,'table');
						$tt = array();
						foreach($j as $vv){
							$tt['count'] += $vv['count'];
					  		$tt['total'] += $vv['total'];
					  		$tt['real'] += $vv['real'];
					  		$tt['cache'] += $vv['cache'];
					  		$tt['error'] += $vv['error'];
						}
						$j['all']=$tt;

						echo $this->ocurl->outtable($j);
					
					}
				}
			}
			echo '</fieldset>';
			echo '<footer>---Debug Bottom---</footer>';
		}

		// $this->log_use($log_total,$log_real,$log_error);
		*/

					
		return $cache_arr;
	}	

	public function translate($data)
    {
        return $this->exec($data, $this->from, $this->to);

    }
    public function exec($text, $source, $target, $read_cache = false)
    {
        if (is_numeric($text)) {
            return $text;
        }
        $this->setSource($source);
        $this->setTarget($target);
        if ($this->source == $this->target) {
            return false;
        }
        $result = false;
        if (is_array($text)) {
            $cache_keys = array();
            $results    = array();
            foreach ($text as $key => $val) {
                $text[$key] = $this->filter_text($val);
                if (preg_match('/^[0-9]+$/', $text[$key]) || in_array(strtoupper($text[$key]), self::$ignores)) {
                    $results[$key] = $text[$key];
                    unset($text[$key]);
                } else {
                    $cache_keys[$key] = 'translation_' . md5($text[$key]) . '_' . $this->source . '_' . $this->target;
                }
            }$cache_results = null;
            // $cache_results = $this->otc->_cache->getMulti(array_unique($cache_keys));
            if ($cache_results) {
                foreach ($cache_keys as $key => $cache_key) {
                    if (isset($cache_results[$cache_key])) {
                        $results[$key] = $cache_results[$cache_key];
                        unset($text[$key], $cache_keys[$key]);
                    }
                }
            }
            if (!($text) || $read_cache) {
                return $results;
                $text = $this->filter_text($text);
                if (preg_match('/^[0-9]+$/', $text) || in_array(strtoupper($text), self::$ignores)) {
                    return $text;
                }
                $cache_key = 'translation_' . md5($text) . '_' . $this->source . '_' . $this->target;
                // $cache_result = $this->otc->_cache->get($cache_key);
                if ($cache_result) {
                    return $cache_result;
                }
            }
        } else {
            $text = $this->filter_text($text);
            // return $text;
            // $cache_key = 'translation_' . md5($text) . '_' . $this->source . '_' . $this->target;
            // // $cache_result = $this->otc->_cache->get($cache_key);
            // return $cache_result;
        }
        if (method_exists($this, $this->channel)) {
            $result = call_user_func(array($this, $this->channel), $text);
            if ($result) {
                if (is_array($result)) {
                    if (count($result) == count($cache_keys)) {
                        // $this->otc->_cache->setMulti(array_combine($cache_keys, $result), $this->cache_expire);
                        $cache_keys_keys = array_keys($cache_keys);
                        foreach ($result as $key => $value) {
                            $results[$cache_keys_keys[$key]] = $value;
                        }
                        ksort($results);
                        return $results;
                    }
                    $result = false;
                } else {
                    // $this->otc->_cache->set($cache_key, $result, $this->cache_expire);
                }
            }
        }
        return $result;
    }
    private function shr32($x, $bits)
    {
        if ($bits <= 0) {
            return $x;
        }
        if (32 <= $bits) {
            return 0;
        }
        $bin = decbin($x);
        $l   = strlen($bin);
        if (32 < $l) {
            $bin = substr($bin, $l - 32, 32);
        } else if ($l < 32) {
            $bin = str_pad($bin, 32, '0', STR_PAD_LEFT);
        }
        return bindec(str_pad(substr($bin, 0, 32 - $bits), 32, '0', STR_PAD_LEFT));
    }
    private function charCodeAt($str, $index)
    {
        $char = mb_substr($str, $index, 1, 'UTF-8');
        if (mb_check_encoding($char, 'UTF-8')) {
            $ret = mb_convert_encoding($char, 'UTF-32BE', 'UTF-8');
            return hexdec(bin2hex($ret));
        }
        return null;
    }
    private function RL($a, $b)
    {
        $len = strlen($b);
        $c   = 0;
        while ($c < ($len - 2)) {
            $d = $b[$c + 2];
            $d = (('a' <= $d ? $this->charCodeAt($d, 0) - 87 : intval($d)));
            $d = (($b[$c + 1] == '+' ? $this->shr32($a, $d) : $a << $d));
            $a = (($b[$c] == '+' ? ($a + $d) & 4294967295 : $a ^ $d));
            $c += 3;
        }
        return $a;
    }
    protected function TKK()
    {
        $a = 561666268;
        $b = 1526272306;
        return 406398 . '.' . ($a + $b);
    }
    private function TL($a)
    {
        $tkk = explode('.', $this->TKK());
        $b   = $tkk[0];
        $d   = array();
        $e   = 0;
        $f   = 0;
        while ($f < mb_strlen($a, 'UTF-8')) {
            $g = $this->charCodeAt($a, $f);
            if ($g < 128) {
                $d[$e++] = $g;
            } else {
                if ($g < 2048) {
                    $d[$e++] = ($g >> 6) | 192;
                } else if ((55296 == $g & 64512) && (($f + 1) < mb_strlen($a, 'UTF-8')) && (56320 == $this->charCodeAt($a, $f + 1) & 64512)) {
                    $g       = 65536 + (($g & 1023) << 10) + ($this->charCodeAt($a, ++$f) & 1023);
                    $d[$e++] = ($g >> 18) | 240;
                    $d[$e++] = (($g >> 12) & 63) | 128;
                } else {
                    $d[$e++] = ($g >> 12) | 224;
                    $d[$e++] = (($g >> 6) & 63) | 128;
                }
                $d[$e++] = ($g & 63) | 128;
            }
            ++$f;
        }
        $a = $b;
        $e = 0;
        while ($e < count($d)) {
            $a += $d[$e];
            $a = $this->RL($a, '+-a^+6');
            ++$e;
        }
        $a = $this->RL($a, '+-3^+b+-f');
        $a ^= $tkk[1];
        if ($a < 0) {
            $a = ($a & 2147483647) + 2147483648;
        }
        $a = fmod(floatval($a), 1000000);
        return sprintf('%d.%d', $a, $a ^ $b);
    }
    private function getMicrosoftAccessToken()
    {
        $url       = 'https://datamarket.accesscontrol.windows.net/v2/OAuth2-13/';
        $post_data = array('grant_type' => 'client_credentials', 'scope' => 'http://api.microsofttranslator.com', 'client_id' => $this->microsoft_account['client_id'], 'client_secret' => $this->microsoft_account['client_secret']);
        $response  = Request::execute($url, array('post_data' => $post_data));
        if (is_array($response)) {
            return false;
        }
        $access_token = false;
        if ($response) {
            $response = json_decode($response, true);
            if (!(empty($response['access_token']))) {
                $access_token = $response['access_token'];
            }
        }
        return $access_token;
    }
    private function getConvertCodes($channel)
    {
        switch ($channel) {
            case 'baidu':$convert_codes = array(self::$cn_code => 'ZH', 'JA' => 'JP', 'KO' => 'KOR', 'ES' => 'SPA', 'FR' => 'FRA', 'AR' => 'ARA', 'BG' => 'BUL', 'ET' => 'EST', 'DA' => 'DAN', 'FI' => 'FIN', 'RO' => 'ROM', 'SL' => 'SLO', 'SV' => 'SWE', 'ZH-TW' => 'CHT');
                break;
            case 'microsoft':$convert_codes = array(self::$cn_code => 'ZH-CHS', 'BS' => 'BS-LATN', 'ZH-TW' => 'ZH-CHT', 'SR' => 'SR-CYRL');
                break;
            case 'youdao':$convert_codes = array(self::$cn_code => 'ZH_CN', 'KO' => 'KR', 'ES' => 'SP');
                break;
            default:$convert_codes = array();
                break;
        }
        return $convert_codes;
    }
    private function getLanguages($channel)
    {
        switch ($channel) {
            case 'baidu':$languages = array('AUTO', 'ZH', 'EN', 'YUE', 'WYW', 'JP', 'KOR', 'FRA', 'SPA', 'TH', 'ARA', 'RU', 'PT', 'DE', 'IT', 'EL', 'NL', 'PL', 'BUL', 'EST', 'DAN', 'FIN', 'CS', 'ROM', 'SLO', 'SWE', 'HU', 'CHT');
                break;
            case 'microsoft':$languages = array('AR', 'BS-LATN', 'BG', 'CA', 'ZH-CHS', 'ZH-CHT', 'HR', 'CS', 'DA', 'NL', 'EN', 'ET', 'FI', 'FR', 'DE', 'EL', 'HT', 'HE', 'HI', 'MWW', 'HU', 'ID', 'IT', 'JA', 'SW', 'TLH', 'TLH-QAAK', 'KO', 'LV', 'LT', 'MS', 'MT', 'NO', 'FA', 'PL', 'PT', 'OTQ', 'RO', 'RU', 'SR-CYRL', 'SR-LATN', 'SK', 'SL', 'ES', 'SV', 'TH', 'TR', 'UK', 'UR', 'VI', 'CY', 'YUA');
                break;
            case 'youdao':$languages = array('ZH_CN', 'EN', 'JA', 'KR', 'FR', 'RU', 'SP');
                break;
            default:$languages = array();
                break;
        }
        return $languages;
    }
    public function check_lang($text)
    {
        return $this->check_lang_google($text);
    }
    public function check_lang_google($text)
    {
        $url       = 'http://translate.google.' . $this->google_domain . '/translate_a/single?';
        $urlParams = array('client' => 't', 'sl' => 'auto', 'hl' => 'zh-CN', 'tk' => $this->TL($text), 'ie' => 'UTF-8', 'oe' => 'UTF-8', 'dt' => 't', 'q' => $text);
        $url .= http_build_query($urlParams);
        $request_data = array('referer' => 'http://translate.google.' . $this->google_domain . '/');
        $response     = Request::execute($url, $request_data);
        if ($response && is_string($response)) {
            $response = preg_replace('/,+/', ',', $response);
            $response = json_decode($response, true);
            if (!(empty($response[2]))) {
                return $response[2];
            }
        }
        return false;
    }
    public function check_lang_baidu($text)
    {
        $url          = 'http://fanyi.baidu.com/langdetect';
        $request_data = array('referer' => 'http://fanyi.baidu.com/', 'post_data' => array('query' => $text));
        $response     = Request::execute($url, $request_data);
        if ($response && is_string($response)) {
            $response = json_decode($response, true);
            if (!(empty($response['lan']))) {
                return $response['lan'];
            }
        }
        return false;
    }
    protected function google_free($text)
    {
        $url      = 'http://translate.google.' . $this->google_domain . '/translate_a/single?';
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
            $text_arr = explode("\n", $text);
        }
        $urlParams = array('client' => 't', 'sl' => strtolower($this->source), 'tl' => strtolower($this->target), 'tk' => $this->TL($text), 'ie' => 'UTF-8', 'oe' => 'UTF-8');
        $url .= http_build_query($urlParams);
        $url .= '&dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=ss&dt=t';
        $request_data              = array('referer' => 'http://translate.google.' . $this->google_domain . '/');
        $request_data['post_data'] = array('q' => $text);
        $response                  = Request::execute($url, $request_data);
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = preg_replace('/,+/', ',', $response);
            $response = json_decode($response, true);
            if (!(empty($response[0]))) {
                if ($is_array) {
                    $result = array();
                    if (count($response[0]) == count($text_arr)) {
                        foreach ($response[0] as $arr) {
                            $result[] = rtrim($arr[0], "\n" . ' ');
                        }
                    } else {
                        $index = 0;
                        $nbsp  = chr(194) . chr(160);
                        $i     = 0;
                        while ($i < count($response[0])) {
                            $arr   = $response[0][$i];
                            $text  = str_replace($nbsp, '', preg_replace(array('/\\s/s', '/,+/s'), array('', ','), $text_arr[$index]));
                            $_text = str_replace($nbsp, '', preg_replace(array('/\\s/s', '/,+/s'), array('', ','), $arr[1]));
                            if (stristr($text, $_text)) {
                                if (!(isset($result[$index]))) {
                                    $result[$index] = rtrim($arr[0], "\n" . ' ');
                                } else {
                                    $result[$index] .= ' ' . rtrim($arr[0], "\n" . ' ');
                                }
                                $len = min(strlen($text), strlen($_text));
                                if (substr($text, -1 * $len) == $_text) {
                                    ++$index;
                                }
                            }
                            ++$i;
                        }
                    }
                } else {
                    foreach ($response[0] as $key => $arr) {
                        if ($result) {
                            $result .= '. ';
                        }
                        $result .= trim($arr[0]);
                    }
                }
            }
        }

        static $i = 0;
        $i++;

        if (isset($_GET['debug'])) {

            echo $i;
            dump($text);
            dump($result);

            echo '<hr>';
        }
        return $result;
    }
    protected function google($text)
    {

		$url = 'https://www.googleapis.com/language/translate/v2';
		// $url = 'http://47.52.43.195/translate.php';
        if (!($this->google_account)) {
            return $this->google_free($text);
        }
        $source = $this->source;
        if ($source == 'AUTO') {
            $source   = false;
   	    $url = $url.'/detect?key=' . $this->google_account['api_key'] . '&q=' . urlencode($text);
            $response = Request::execute($url, array('referer' => $this->google_account['referer']));
            if (is_array($response)) {
                return false;
            }
            if ($response) {
                $response = json_decode($response, true);
                if (!(empty($response['data']['detections'][0]['language']))) {
                    $source = $response['data']['detections'][0]['language'];
                }
            }
        }
        $result = false;
        if ($source) {
            if (is_array($text)) {
                foreach ($text as $value) {
					$url = $url.'?key=' . $this->google_account['api_key'] . '&q=' . urlencode($value) . '&source=' . strtolower($source) . '&target=' . strtolower($this->target);
                    $response = Request::execute($url, array('referer' => $this->google_account['referer']));
                    if (is_array($response)) {
                        return false;
                    }
                    if ($response) {
                        $response = json_decode($response, true);
                        if (!(empty($response['data']['translations'][0]['translatedText']))) {
                            $result[] = $response['data']['translations'][0]['translatedText'];
                        }
                    }
                }
            } else {
		$post = array(
					'key'=>$this->google_account['api_key'],
					'q'=>urlencode($text),
					'source'=>strtolower($source),
					'target'=>strtolower($this->target),
					);
				
				if(strpos($text,$this->_t_array_pre)!==false){
					$qs = explode($this->_t_array_pre, $text);
					$post['q']=array();
					$post['q']=$qs;
					$post =  http_build_query($post);
					$post = preg_replace('@%5B\d+%5D@isU','',$post);
					// echo '<hr>';
				}
			//	$url = $url.'?key=' . $this->google_account['api_key'] . '&q=' . urlencode($text) . '&source=' . strtolower($source) . '&target=' . strtolower($this->target);
				$response = Request::execute($url, array('referer' => $this->google_account['referer'],'post_data'=>$post));
                if (is_array($response)) {
                    return false;
                }
                if ($response) {
                    	$response = json_decode($response, true);
					// if (!(empty($response['data']['translations'][0]['translatedText']))) 
					// {
					// 	$result = $response['data']['translations'][0]['translatedText'];
					// }

					 $result = array();
					 if($response['data']['translations']){
					 	foreach($response['data']['translations'] as $v)
					 	 $result[]=$v["translatedText"];
					 }
					
					 $result = implode($this->_t_array_pre,$result);
                }
            }
        }
        return $result;
    }

	protected function get_baidu_free_sign($str,$gtk){

			return Yourcode::hash($str,$gtk);
	}
	function get_baidu_free_data(){
		static $data;
		$url = 'http://fanyi.baidu.com';
		// $url = 'http://hitao.l.onebound.cn/?go=code&sid=cf74ccd660934c94ffa9e8fb6fcced75&w=92&h=34&t=0.11351447096860989';

			//$url = 'http://fanyi.baidu.com';
		/*

<script>
window['common'] = {
    token: 'e3bfcb360ba94d7bfbb2e6afd45adecb',
    systime: '1526716300633',
    logid: 'cabc1b44ebba820f95735d39f7dc2c42',
    langList: {
                'zh': '中文','jp': '日语','jpka': '日语假名','th': '泰语','fra': '法语','en': '英语','spa': '西班牙语','kor': '韩语','tr': '土耳其语','vie': '越南语','ms': '马来语','de': '德语','ru': '俄语','ir': '伊朗语','ara': '阿拉伯语','est': '爱沙尼亚语','be': '白俄罗斯语','bul': '保加利亚语','hi': '印地语','is': '冰岛语','pl': '波兰语','fa': '波斯语','dan': '丹麦语','tl': '菲律宾语','fin': '芬兰语','nl': '荷兰语','ca': '加泰罗尼亚语','cs': '捷克语','hr': '克罗地亚语','lv': '拉脱维亚语','lt': '立陶宛语','rom': '罗马尼亚语','af': '南非语','no': '挪威语','pt_BR': '巴西语','pt': '葡萄牙语','swe': '瑞典语','sr': '塞尔维亚语','eo': '世界语','sk': '斯洛伐克语','slo': '斯洛文尼亚语','sw': '斯瓦希里语','uk': '乌克兰语','iw': '希伯来语','el': '希腊语','hu': '匈牙利语','hy': '亚美尼亚语','it': '意大利语','id': '印尼语','sq': '阿尔巴尼亚语','am': '阿姆哈拉语','as': '阿萨姆语','az': '阿塞拜疆语','eu': '巴斯克语','bn': '孟加拉语','bs': '波斯尼亚语','gl': '加利西亚语','ka': '格鲁吉亚语','gu': '古吉拉特语','ha': '豪萨语','ig': '伊博语','iu': '因纽特语','ga': '爱尔兰语','zu': '祖鲁语','kn': '卡纳达语','kk': '哈萨克语','ky': '吉尔吉斯语','lb': '卢森堡语','mk': '马其顿语','mt': '马耳他语','mi': '毛利语','mr': '马拉提语','ne': '尼泊尔语','or': '奥利亚语','pa': '旁遮普语','qu': '凯楚亚语','tn': '塞茨瓦纳语','si': '僧加罗语','ta': '泰米尔语','tt': '塔塔尔语','te': '泰卢固语','ur': '乌尔都语','uz': '乌兹别克语','cy': '威尔士语','yo': '约鲁巴语','yue': '粤语','wyw': '文言文','cht': '中文繁体'    },

<script>window.bdstoken = '';window.gtk = '320305.131321201';</script>

		*/
		
		/*if(strpos($str,'&#')!==false){
			preg_match_all('@&#[\d]+;@',$str,$matchs);
			foreach($matchs[0] as $v){
					// 將 &#25105 轉回 '我'
					$v2 = mb_convert_encoding($v, 'UTF-8', 'HTML-ENTITIES'); // '我', 				
					$str = str_replace($v,$v2,$str);
			}
		}*/
		if(!$data){

			$res =  Request::execute($url);
			var_dump($res);exit();
// var_dump($this->ocurl->m_curl->m_header);
			$header = $this->ocurl->m_curl->m_header;
			$cookie = array();
			foreach($header as $k=>$v){
					foreach($v as $vv){
					
					if($k=='Set-Cookie'){
						// var_dump($vv);
						preg_match('/([^=]+)=([^;]+)/i', $vv,$match);
						$cookie[$match[1]] = urldecode($match[2]);
					}
					
					
				}	

			}
			 
			$token = explode("token: '",$res);
			list($token) = explode("'",$token[1]);

			$gtk = explode("window.gtk = '",$res);
			list($gtk) = explode("'",$gtk[1]);

			$data['cookie']=$cookie;
			$data['token']=$token;
			$data['gtk']=$gtk;
		}
		// $data['sign']=$this->get_sign2($str,$gtk,$token);
// var_dump($data);
		return $data;

	}
    protected function baidu_free($text)
    {
        $convert_codes = $this->getConvertCodes('baidu');
        if (isset($convert_codes[$this->source])) {
            $from = $convert_codes[$this->source];
        } else {
            $from = $this->source;
        }
        if (isset($convert_codes[$this->target])) {
            $to = $convert_codes[$this->target];
        } else {
            $to = $this->target;
        }
        $baidu_languages = $this->getLanguages('baidu');
        if (!(in_array($from, $baidu_languages)) || !(in_array($to, $baidu_languages))) {
            return $this->google($text);
        }
        $url      = 'http://fanyi.baidu.com/v2transapi';
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
        }
if(strpos($text,$this->_t_array_pre)!==false)$is_array=true;


		$data=array(
			'cookie'=>array('BAIDUID'=>'711AD66D8215997BF6B34D0AF928B63B:FG=1'),
			'gtk'=>"320305.131321201",
			'token'=>"8b89db38c870d01b0a0602fabf94be29",
			);
		$sign = $this->get_baidu_free_sign($text,$data['gtk']);

		$data['cookie']['BAIDUID'] = '711AD66D8215997BF6B34D0AF928B63B:FG=1';
		$data['token']='8b89db38c870d01b0a0602fabf94be29';
		$from = strtolower($from);
		$to = strtolower($to);
		$post_data = array(

				'from'=>$from,
				'query'=>$text,
				'sign'=>$sign,
				'simple_means_flag'=>'3',
				'to'=>$to,
				'token'=>$data['token'],
				'transtype'=>'translang',
				);

		//echo $post;exit();
		//$post = 'from=zh&to=en&query=%E6%88%91%E6%81%A8%E4%B8%AD%E5%9B%BD%EF%BC%8C%E6%88%91%E4%B8%8D%E5%96%9C%E6%AC%A2%E4%B8%AD%E5%9B%BD%0A%E6%88%91%E6%81%A8%E4%B8%AD%E5%9B%BD%EF%BC%8C%E6%88%91%E4%B8%8D%E5%96%9C%E6%AC%A2%E4%B8%AD%E5%9B%BD%0A%E6%88%91%E6%81%A8%E4%B8%AD%E5%9B%BD%EF%BC%8C%E6%88%91%E4%B8%8D%E5%96%9C%E6%AC%A2%E4%B8%AD%E5%9B%BD&transtype=realtime';
		// $header=array(
		// 	'Cookie: BAIDUID=66DB770A12D17504CFDC8768C92BDD38:FG=1; '
		// 	);
		$header=array(
			'Cookie: BAIDUID='.$data['cookie']['BAIDUID'].'; '
			);
		// $post_data = array('from' => strtolower($from), 'to' => strtolower($to), 'query' => $text, 'transtype' => 'v2transapi', 'simple_means_flag' => '3');
        $referer   = 'http://fanyi.baidu.com/';
		$response = Request::execute($url, array('post_data' => $post_data, 'referer' => $referer,'header'=>$header));
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = json_decode($response, true);
            if ($is_array) {
                if (!(empty($response['trans_result']['data']))) {
                    $result = array();
                    foreach ($response['trans_result']['data'] as $arr) {
                        $result[] = $arr['dst'];
                    }
                }
				 $result = implode($this->_t_array_pre,$result);
            } else if (!(empty($response['trans_result']['data'][0]['dst']))) {
                $result = $response['trans_result']['data'][0]['dst'];
            }
        }
        return $result;
    }
    protected function baidu($text)
    {
        if (!($this->baidu_account)) {
            return $this->baidu_free($text);
        }
        $convert_codes = $this->getConvertCodes('baidu');
        if (isset($convert_codes[$this->source])) {
            $from = $convert_codes[$this->source];
        } else {
            $from = $this->source;
        }
        if (isset($convert_codes[$this->target])) {
            $to = $convert_codes[$this->target];
        } else {
            $to = $this->target;
        }
        $baidu_languages = $this->getLanguages('baidu');
        if (!(in_array($from, $baidu_languages)) && !(in_array($to, $baidu_languages))) {
            return $this->google($text);
        }
        $url      = 'http://api.fanyi.baidu.com/api/trans/vip/translate';
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
        }
        $salt              = uniqid();
        $post_data         = array('q' => $text, 'appid' => $this->baidu_account['appid'], 'salt' => $salt, 'from' => strtolower($from), 'to' => strtolower($to));
        $post_data['sign'] = md5($this->baidu_account['appid'] . $text . $salt . $this->baidu_account['sec_key']);
        $response          = Request::execute($url, array('post_data' => $post_data));
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = json_decode($response, true);
            if ($is_array) {
                if (!(empty($response['trans_result']))) {
                    $result = array();
                    foreach ($response['trans_result'] as $arr) {
                        $result[] = $arr['dst'];
                    }
                }
            } else if (!(empty($response['trans_result'][0]['dst']))) {
                $result = $response['trans_result'][0]['dst'];
            }
        }
        return $result;
    }
    protected function baidu_old($text)
    {
        return false;
        $to              = $this->target;
        $baidu_languages = $this->getLanguages('baidu');
        if (!(in_array($from, $baidu_languages)) || !(in_array($to, $baidu_languages))) {
            return $this->google($text);
        }
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
        }
        $url      = 'http://openapi.baidu.com/public/2.0/bmt/translate?client_id=' . $this->baidu_client_id . '&q=' . urlencode($text) . '&from=' . strtolower($from) . '&to=' . strtolower($to);
        $response = Request::execute($url);
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = json_decode($response, true);
            if ($is_array) {
                if (!(empty($response['trans_result']))) {
                    $result = array();
                    foreach ($response['trans_result'] as $arr) {
                        $result[] = $arr['dst'];
                    }
                }
            } else if (!(empty($response['trans_result'][0]['dst']))) {
                $result = $response['trans_result'][0]['dst'];
            }
        }
        return $result;
    }
    protected function microsoft($text)
    {
        if (!($this->microsoft_account)) {
            return false;
        }
        if (!($this->microsoft_access_token)) {
            $this->microsoft_access_token = $this->getMicrosoftAccessToken();
        }
        if (!($this->microsoft_access_token)) {
            return false;
        }
        $result        = false;
        $convert_codes = $this->getConvertCodes('microsoft');
        if (isset($convert_codes[$this->source])) {
            $from = $convert_codes[$this->source];
        } else {
            $from = $this->source;
            if ($from == 'auto') {
                $from = '';
            }
        }
        if (isset($convert_codes[$this->target])) {
            $to = $convert_codes[$this->target];
        } else {
            $to = $this->target;
        }
        if (is_array($text)) {
            foreach ($text as $value) {
                $url      = 'http://api.microsofttranslator.com/v2/Http.svc/Translate?text=' . urlencode($value) . '&to=' . $to . '&from=' . $from;
                $header   = array('Authorization: Bearer ' . $this->microsoft_access_token, 'Content-Type: text/xml');
                $response = Request::execute($url, array('header' => $header));
                if (is_array($response)) {
                    return false;
                }
                if ($response) {
                    $response = simplexml_load_string($response);
                    if ($response) {
                        $response = (array) $response;
                        if (isset($response[0])) {
                            $result[] = $response[0];
                        }
                    }
                }
            }
        } else {
            $url      = 'http://api.microsofttranslator.com/v2/Http.svc/Translate?text=' . urlencode($text) . '&to=' . $to . '&from=' . $from;
            $header   = array('Authorization: Bearer ' . $this->microsoft_access_token, 'Content-Type: text/xml');
            $response = Request::execute($url, array('header' => $header));
            if (is_array($response)) {
                return false;
            }
            if ($response) {
                $response = simplexml_load_string($response);
                if ($response) {
                    $response = (array) $response;
                    if (isset($response[0])) {
                        $result = $response[0];
                    }
                }
            }
        }
        return $result;
    }
    protected function youdao_free($text)
    {
        $convert_codes = $this->getConvertCodes('youdao');
        if (isset($convert_codes[$this->source])) {
            $from = $convert_codes[$this->source];
        } else {
            $from = $this->source;
        }
        if (isset($convert_codes[$this->target])) {
            $to = $convert_codes[$this->target];
        } else {
            $to = $this->target;
        }
        $youdao_languages = $this->getLanguages('youdao');
        if (!(in_array($from, $youdao_languages)) || !(in_array($to, $youdao_languages))) {
            return $this->google($text);
        }
        $url      = 'http://fanyi.youdao.com/translate?smartresult=dict&smartresult=rule&smartresult=ugc&sessionFrom=https://www.baidu.com/link';
	$url = 'http://fanyi.youdao.com/translate_o?smartresult=dict&smartresult=rule';
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
        }
        $header    = array('Accept:application/json, text/javascript, */*; q=0.01', 'Accept-Encoding:gzip, deflate', 'Accept-Language:zh-CN,zh;q=0.8', 'Connection:keep-alive');
        // $post_data = array('type' => $from . '2' . $to, 'i' => $text, 'doctype' => 'json', 'xmlVersion' => '1.8', 'keyfrom' => 'fanyi.web', 'ue' => 'UTF-8', 'action' => 'FY_BY_CLICKBUTTON', 'typoResult' => 'true');
		$header=array(
			'Cookie: OUTFOX_SEARCH_USER_ID=-155807207@10.169.0.84; JSESSIONID=aaaW8Ssp_CMMsfRQOC9nw; OUTFOX_SEARCH_USER_ID_NCOO=522793853.8710366; fanyi-ad-id=44547; Hm_lvt_ba7c84ce230944c13900faeba642b2b4=1526818051; fanyi-ad-closed=1; Hm_lpvt_ba7c84ce230944c13900faeba642b2b4=1526821095; ___rl__test__cookies=1526821221014',
			'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3432.3 Safari/537.36'
			);
		$f = '1526818083609';
		// var_dump($f);
		$f = time().'000';
		$d = $text;//='hello';
		$u = "fanyideskweb";
		// $c = i.deEight("rY0D^0'nM0}g5Mm1z%1G4"),
		$c = "rY0D^0'nM0}g5Mm1z%1G4";
		$c = "ebSeFb%=XZ%T[KZ)c(sy!";//2018-05-20 from http://shared.ydstatic.com/fanyi/newweb/v1.0.9/scripts/newweb/fanyi.min.js
		$g = md5($u . $d . $f . $c);
		/*sign是u+d+f+c的md5值
		d 即待翻译的内容
		f是时间戳
		c, u是固定的字符串
		*/
		$s = $in;
		$l = $to;
		$t='FY_BY_REALTIME';
		$t='lan-select';
		$post_data = array(
		            'i'=> $d,
		            'from'=> $s,
		            'to'=> $l,
		            'smartresult'=> "dict",
		            'client'=> $u,
		            'salt'=> $f,
		            'sign'=> $g,
		            'doctype'=> "json",
		            'version'=> "2.1",
		            'keyfrom'=> "fanyi.web",
		            'action'=> $t,
		            'typoResult'=> 'false'
		        );
        $referer   = 'http://fanyi.youdao.com/';
        $response  = Request::execute($url, array('header' => $header, 'post_data' => $post_data, 'referer' => $referer));
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = json_decode($response, true);
            if ($is_array) {
                if (!(empty($response['translateResult']))) {
                    $result = array();
                    foreach ($response['translateResult'] as $arr) {
                        $result[] = $arr[0]['tgt'];
                    }
                }
            } else if (!(empty($response['translateResult'][0][0]['tgt']))) {
                $result = $response['translateResult'][0][0]['tgt'];
            }
        }
        return $result;
    }
    protected function youdao($text)
    {
        if (!(in_array($this->target, array('ZH-CN', 'EN')))) {
            return $this->google($text);
        }
        if (!($this->youdao_account)) 
	{
            return $this->youdao_free($text);
        }
        $is_array = false;
        if (is_array($text)) {
            $is_array = true;
            $text     = implode("\n", $text);
        }
        $url      = 'http://fanyi.youdao.com/openapi.do?keyfrom=' . $this->youdao_account['key_from'] . '&key=' . $this->youdao_account['api_key'] . '&type=data&doctype=json&only=translate&version=1.1&q=' . urlencode($text);
        $response = Request::execute($url);
        if (is_array($response)) {
            return false;
        }
        $result = false;
        if ($response) {
            $response = json_decode($response, true);
            if ($is_array) {
                if (!(empty($response['translation']))) {
                    $result = array();
                    foreach ($response['translation'] as $value) {
                        $result[] = $value;
                    }
                }
            } else if (!(empty($response['translation'][0]))) {
                $result = $response['translation'][0];
            }
        }
        return $result;
    }

    public static function replaceChinesePunctuation($text)
    {
        $parttern    = array('，', '。', '、', '“', '”', '‘', '’', '？', '；', '：', '【', '】', '『', '』', '《', '》', '！', '．', '＆', '－', '＇', '　', "\t", "\r\n", "\r", "\n");
        $replacement = array(',', '.', ',', '"', '"', '\'', '\'', '?', ';', ':', '[', ']', '{', '}', '<', '>', '!', '.', '&', '-', '\'', ' ', ' ', ' ', ' ', ' ');
        return str_replace($parttern, $replacement, $text);
    }

    protected function filter_text($text)
    {
    	return $text;
        $text        = str_replace(self::$filter_keywords, '', html_entity_decode($text, ENT_QUOTES, 'UTF-8'));
        $parttern    = array('，', '。', '、', '“', '”', '‘', '’', '？', '；', '：', '【', '】', '『', '』', '《', '》', '！', '．', '＆', '－', '＇', '　', "\t", "\r\n", "\r", "\n");
        $replacement = array(',', '.', ',', '"', '"', '\'', '\'', '?', ';', ':', '[', ']', '{', '}', '<', '>', '!', '.', '&', '-', '\'', ' ', ' ', ' ', ' ', ' ');
        $text        = self::replaceChinesePunctuation($text);
        $_text       = str_replace('&', '/', $text);
        $text        = '';
        $length      = mb_strlen($_text, 'UTF-8');
        $i           = 0;
        while ($i < $length) {
            $char = mb_substr($_text, $i, 1, 'UTF-8');
            $ord  = ord($char);
            if (($ord == 9) || ($ord == 10) || ($ord == 13)) {
                $text .= ' ';
            } else if ((31 < $ord) && ($ord != 127)) {
                $text .= $char;
            }
            ++$i;
        }
        if ($this->replace_keywords) {
            foreach ($this->replace_keywords as $result) {
                if (!(empty($result['is_preg']))) {
                    $text = preg_replace($result['keyword'], $result['replacement'], $text);
                } else {
                    $text = str_replace($result['keyword'], $result['replacement'], $text);
                }
            }
        }
        return $text;
    }
}
