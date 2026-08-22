<?php
namespace otao;

class ObApiHelper
{
    public $client;
    public function __construct($client)
    {
        $this->client = &$client;

    }

    /**
     * 根据URL判断网站类型和获取 idS
     */
    public function parse_url($url)
    {
if(substr($url,0,4)!='http'){		
			preg_match('@http(s)?\://[^ ]+@', $url, $u);
			if(!empty($u[0])){
				$url=$u[0];
			}elseif(strpos($url,'%3A%2F%2F')!==false){//即使url转义过一次也能处理
				$url2 = urldecode($url);
				preg_match('@http(s)?\://[^ ]+@', $url2, $u);
				if($u[0]) $url=$u[0];
			}
		}
		$url2 = self::short_url($url);
		if($url2==$url){

			foreach($this->client->apis as $api){
				$url2 = $this->item($api)->short_url($url);
				if($url2!=$url){
					$url = $url2;
					break;
				} 
			}
		}else{
			$url = $url2;
		}
        $result = array(
            'type'  => null,
            'id'    => null,
            'error' => null,
        );

        if (empty($url)) {
            $result['error'] = 'url is empty!';
            return $result;
        }

        $url = str_replace('&amp;', '&', $url);
        $id = '';
        //http://h5.m.taobao.com/guide/detail.html?id=1_1000180541583258609&spm=a2141.7990155.1.1&scm=1007.11419.77324.0
        if (strpos($url, 'taobao.') !== false || strpos($url, 'tmall.') !== false) {
            if (strpos($url, 'a.m.taobao.com') !== false) {
                $taobao_url = explode("com/i", $url);
                list($id)   = explode(".htm?", $taobao_url[1]);
            } elseif (strpos($url, 'guide/detail.html') !== false) {
                preg_match('@id=1_[\d]{7}([\d]+)@is', $url, $match);
                if ($match[1]) {
                    $id = $match[1];
                }

            } else {
                //http://world.taobao.com/item/38504421713.htm?fromSite=main&spm=a217o.7288001.1998464449.10.Wz9naR&scm=1007.11581.6985.100200300000000&pvid=14c6c6d6-5f34-4b3f-847f-8b6216191650
                if (strpos($url, 'world.taobao.com') !== false) {
                    list($url) = explode('?', $url);
                }

                if (strpos($url, 'id=')) {
                    $arr = parse_url($url);
                    if ($arr['query']) {
                        $queryParts = explode('&', $arr['query']);
                        foreach ($queryParts as $param) {
                            $item = explode('=', $param);
                            if ($item[0] == 'id') {
                                $id = $item[1];
                            }

                        }
                    } else {
                        preg_match('@id=(\d+)(&)?$@isU', $q, $match);
                        $id = $match[1];
                    }

                } elseif (preg_match('@item/(\d+).htm@', $url, $m)) {
                    $id = $m[1];
                }
            }
            $result['id']   = $id;
            $result['type'] = 'taobao';
        } elseif (strpos($url, '1688') !== false) {
            //
            //http://detail.m.1688.com/page/index.htm?offerId=529037908872
            //http://m.1688.com/offer/534408278560.html?spm=a26g8.7662792.1998744630.1.TBKyfT
            preg_match('@1688.com/page/index.htm\?offerId=(\d+)@is', $url, $match);
            $result['id'] = !empty($match[1]) ? $match[1] : '';
            if (!$result['id']) {
                preg_match('@offer/(\d+).html@isU', $url, $match);
                $result['id'] = $match[1];
            }
            $result['type'] = '1688';
        } elseif (strpos($url, 'jd.') !== false) {
            //https://item.m.jd.com/product/14403224988.html
            preg_match('@item.m.jd.com/product/(\d+).html@isU', $url, $match);
            
            if (!isset($match[1])) {
                preg_match('@jd.com/(\d+).html@isU', $url, $match);
                $result['id']   = $match[1];
                $result['type'] = 'jd';

            }else{
				$result['id']   = $match[1];
				$result['type'] = 'jd';
			}

        } elseif (strpos($url, 'aliexpress.') !== false) {
            //https://www.aliexpress.com/item//32667038134.html
            preg_match('@aliexpress.com/item/[^/]+/(\d+).html@isU', $url, $match);
            $result['id']   = $match[1];
            $result['type'] = 'aliexpress';

        } elseif (strpos($url, 'dangdang.') !== false) {
            //http://product.dangdang.com/1022181648.html
            preg_match('@dangdang.com/(\d+).html@isU', $url, $match);
            $result['id']   = $match[1];
            $result['type'] = 'dangdang';
        } elseif (strpos($url, 'ebay.') !== false) {
            //http://www.ebay.com/itm/Mens-Ugg-Chester-Metal-Moccasin-Slipper-1004247-M-MTL-/182387160286?var=&hash=item2a771f34de:m:mo26Bj5hZ6YSyRQ-xjNxGKw
            preg_match('@ebay.com/itm/[^/]+/(\d+)@is', $url, $match);
            if (!$match[1]) {
                preg_match('@ebay.com/itm/(\d+)@is', $url, $match);
            }

            $result['id']   = $match[1];
            $result['type'] = 'ebay';
        } elseif (strpos($url, 'amazon.') !== false) {
            // https://www.amazon.com/dp/B016LO4UTA
            preg_match('@amazon\.([^/]+)/dp/([\w\d]+)@is', $url, $match);
            if (!$match[2]) {
                preg_match('@amazon\.([^/]+)/[^/]+/dp/([\w\d]+)@is', $url, $match);
            }

            $result['id']       = $match[2];
            $result['type']     = 'amazon';
            $result['language'] = $match[1];
        } elseif (strpos($url, 'biyao.') !== false) {
            // http://www.biyao.com/products/1301315008010400001-0.html
            preg_match('@biyao\.([^/]+)/products/([\w\d]+)@is', $url, $match);

            $result['id']   = $match[2];
            $result['type'] = 'biyao';

        } elseif (strpos($url, 'alibaba.') !== false) {
            //https://www.alibaba.com/product-detail/-New-Arrival-324pcs-Pokemon-Mega_60508319311.html
            preg_match('@alibaba\.([^/]+)/product-detail/([\w\d_\-]+)_([\d]+).html@is', $url, $match);

            $result['id']       = $match[3];
            $result['type']     = 'alibaba';
            $result['language'] = $match[1];
        } elseif (strpos($url, 'ymatou.') !== false) {
            //https://www.ymatou.com/product/8683ad13-398b-4119-b381-e8d73c329e61.html
            $urls = explode('product/', $url);
            $urls = explode('.', $urls[1]);

            $result['id'] = str_replace('-', '_', $urls[0]);
            // var_dump($result['id']);exit();
            $result['type'] = 'ymatou';
        } elseif (strpos($url, 'suning.') !== false) {
            //https://product.suning.com/0070089551/641034913.html
            preg_match('@suning\.([^/]+)/(\d+)/(\d+).html@is', $url, $match);
            $result['id']   = $match[2] . '/' . $match[3];
            $result['type'] = 'suning';
        } elseif (strpos($url,'vvic.')!==false){
			// //https://www.vvic.com/item/14386725
			// preg_match('@vvic\.([^/]+)/item/(\d+)@is', $url, $match);
			// $result['id']=$match[2];
			// $result['type']='vvic';
			//使用item/vvic.php 处理
		}
		
		if(!$result['id']){

			foreach($this->client->apis as $api){
				$result = $this->item($api)->parse_url($url);
				if($result ['id']) break;
			}
		}
        return $result;

    }
    public function short_url($url)
    {
        //http://url.cn/50Qs9hl
        //http://dwz.cn/6PHtlO
        $short_domains = array(
            't.cn',
            't.im',
            'url.cn',
            'dwz.cn',
            'sina.lt',
            'dwz.cn',
            'qq.cn',
            'tb.cn',
            'jd.cn',
            'tinyurl.com',
            'goo.gl',
            'j.mp',
            'bit.ly',
            'goo.gl',
            '1u.ro',
            '1url.com',
            '2pl.us',
            '2tu.us',
            '3.ly',
            'a.gd',
            'a.gg',
            'a.nf',
            'a2a.me',
            'abe5.com',
            'adjix.com',
            'alturl.com',
            'atu.ca',
            'awe.sm',
            'b23.ru',
            'bacn.me',
            'bit.ly',
            'bkite.com',
            'blippr.com',
            'blippr.com',
            'bloat.me',
            'bt.io',
            'budurl.com',
            'buk.me',
            'burnurl.com',
            'c.shamekh.ws',
            'cd4.me',
            'chilp.it',
            'chs.mx',
            'clck.ru',
            'cli.gs',
            'clickthru.ca',
            'cort.as',
            'cuthut.com',
            'cuturl.com',
            'decenturl.com',
            'df9.net',
            'doiop.com',
            'dwarfurl.com',
            'easyurl.net',
            'eepurl.com',
            'eezurl.com',
            'ewerl.com',
            'fa.by',
            'fav.me',
            'ff.im',
            'fff.to',
            'fhurl.com',
            'flic.kr',
            'flq.us',
            'fly2.ws',
            'fuseurl.com',
            'fwd4.me',
            'gl.am',
            'go.9nl.com',
            'go2.me',
            'golmao.com',
            'goo.gl',
            'goshrink.com',
            'gri.ms',
            'gurl.es',
            'hellotxt.com',
            'hex.io',
            'href.in',
            'htxt.it',
            'hugeurl.com',
            'hurl.ws',
            'icanhaz.com',
            'icio.us',
            'idek.net',
            'is.gd',
            'it2.in',
            'ito.mx',
            'j.mp',
            'jijr.com',
            'kissa.be',
            'kl.am',
            'korta.nu',
            'l9k.net',
            'liip.to',
            'liltext.com',
            'lin.cr',
            'linkbee.com',
            'liurl.cn',
            'ln-s.net',
            'ln-s.ru',
            'lnkurl.com',
            'loopt.us',
            'lru.jp',
            'lt.tl',
            'lurl.no',
            'memurl.com',
            'migre.me',
            'minilien.com',
            'miniurl.com',
            'minurl.fr',
            'moourl.com',
            'myurl.in',
            'ncane.com',
            'netnet.me',
            'nn.nf',
            'o-x.fr',
            'ofl.me',
            'omf.gd',
            'ow.ly',
            'oxyz.info',
            'p8g.tw',
            'parv.us',
            'pic.gd',
            'ping.fm',
            'piurl.com',
            'plurl.me',
            'pnt.me',
            'poll.fm',
            'pop.ly',
            'poprl.com',
            'post.ly',
            'posted.at',
            'ptiturl.com',
            'qurlyq.com',
            'rb6.me',
            'readthis.ca',
            'redirects.ca',
            'redirx.com',
            'relyt.us',
            'retwt.me',
            'ri.ms',
            'rickroll.it',
            'rly.cc',
            'rsmonkey.com',
            'rubyurl.com',
            'rurl.org',
            's3nt.com',
            's7y.us',
            'short.ie',
            'short.to',
            'shortna.me',
            'shoturl.us',
            'shrinkster.com',
            'shrinkurl.us',
            'shrtl.com',
            'shw.me',
            'simurl.net',
            'simurl.org',
            'simurl.us',
            'sn.im',
            'sn.vc',
            'snipr.com',
            'snipurl.com',
            'snurl.com',
            'sp2.ro',
            'spedr.com',
            'starturl.com',
            'stickurl.com',
            'sturly.com',
            'su.pr',
            'takemyfile.com',
            'tcrn.ch',
            'thrdl.es',
            'tighturl.com',
            'tiny.cc',
            'tiny.pl',
            'tinyarro.ws',
            'tinytw.it',
            'tinyurl.com',
            'tl.gd',
            'tnw.to',
            'to.ly',
            'togoto.us',
            'tr.im',
            'tr.my',
            'trcb.me',
            'tumblr.com',
            'tw0.us',
            'tw1.us',
            'tw2.us',
            'tw5.us',
            'tw6.us',
            'tw8.us',
            'tw9.us',
            'twa.lk',
            'twi.gy',
            'twit.ac',
        );
        $urls  = parse_url($url);
        $hosts = explode('.', $urls['host']);
        if (count($hosts) > 2) {
            $urls['host'] = $hosts[1] . '.' . $hosts[2];
        }

        if (in_array($urls['host'], $short_domains)) {
            $c    = $this->client->curl($url);
            $url2 = $this->client->file_get_rurl();
            if ($urls['host'] == 'tb.cn') {
                $c = $this->client->curl($url2);
                if (strpos($c, "var url = '") !== false) {
                    $url2 = cut($c, "var url = '", "'");
                }
            }

            if (strpos($url2, '://') !== false) {
                return $url2;
            }

        }
        return $url;
    }

    function setupSize($fileSize)
    {
        $size = $fileSize;
        if ($size == 0) {
            return ("0 Bytes");
        }
        $sizename = array(" Bytes", " KB", " MB", " GB", " TB", " PB", " EB", " ZB", " YB");
        return round($size / pow(1024, ($i = floor(log($size, 1024)))), 2) . $sizename[$i];
    }

    public function debug()
    {
        static $debug_init = 0;

        $api_key    = $this->client->api_key;
        $api_secret = $this->client->api_secret;
        $info       = get_object_vars($this->client);
        //$info = json_encode(get_object_vars($this));
        //$info = json_decode(json_encode($this),true);
        //var_dump($this);
        //echo '<hr>';
        //var_dump($info);

        $info['api_key']    = substr($api_key, 0, 1) . str_pad('*', strlen($api_key), '*') . substr($api_key, -1);
        $info['api_secret'] = substr($api_secret, 0, 1) . str_pad('*', strlen($api_secret), '*') . substr($api_secret, -1);
        $info['api_args']   = str_replace($api_key, $info['api_key'], $info['api_args']);

        $file = $this->client->cache_obj->secache_file;

        $m_curl              = $info['m_curl'];
        $api_text            = $info['api_text'];
        $api_data            = $info['api_data'];
        $api_l_data          = $info['api_l_data'];
        $api_db_data         = $info['api_db_data'];
        $info['m_curl']      = '-';
        $info['api_text']    = '-';
        $info['api_data']    = '-';
        $info['api_l_data']  = '-';
        $info['api_db_data'] = '-';

        $result = $this->client->secache()->status($curBytes, $totalBytes);

        //print_r($curBytes);
        //var_dump($totalBytes);

        if (!headers_sent()) {
            header("Content-Type: text/html; charset=utf-8");
        }

        if ($this->client->debug == 2) {

            echo '<div class="container debug_info" style="margin:5px 10px;background:#FC6">';
            if ($debug_init == 0) {
                echo '<h1 style="padding:5px;background:#F60;color:#000">ObAPI DEBUG info<small>Powered by <a href="http://www.onebound.cn" target="_blank">onebound.cn</a></small></h1>';
                echo '<h2>current Date:' . date('Y-m-d H:i:s') . '/UnixTime:' . time() . '</h2><br>';

            }

            echo '<fieldset><legend>BASE info:</legend>';
            echo '<textarea style="width:100%;height:250px">' . print_r($info, true) . '</textarea>';
            echo '</fieldset>';

            echo '<fieldset><legend>trace info:</legend>';
            echo '<textarea style="width:100%;height:250px">';
            debug_print_backtrace();
            echo '</textarea>';
            echo '</fieldset>';

            echo '<fieldset><legend>api_data:</legend>';

            echo '<strong>远程是否允许缓存</strong>:' . $info['cache'] . '<br>';
            echo '<strong>本地是否允许缓存</strong>:' . $info['cache_local'] . '<br>';
            echo '<strong>本地缓存时限</strong>:' . $info['secache_time'] . '秒<br>';
            echo '<strong>本地缓存状态</strong>:' . $info['api_l_status'] . '<br>';
            echo '<strong>本地缓存尺寸</strong>:' . SECACHE_SIZE . '<br>';
            echo '<strong>本地缓存用量</strong>:' . $this->setupSize($curBytes) . '，共：' . $this->setupSize($totalBytes) . '<br>';
            echo '<strong>本地缓存命中</strong>:' . $result[0]['name'] . ':' . $result[0]['value'] . '/' . $result[1]['name'] . ':' . $result[1]['value'] . '<br>';
            echo '<strong>本地缓存文件</strong>:' . $file . '<br>';
            echo '<p style="float:right"><canvas id="myChart" width="120" height="120"></canvas></p>';
            echo '
			<!--<script src="//cdn.bootcss.com/Chart.js/2.0.0-alpha4/Chart.min.js"></script>-->
			 <script src="http://www.bootcss.com/p/chart.js/docs/Chart.js"></script>

			<script>
var data = [
	{
		value: ' . ($totalBytes ? ($curBytes / $totalBytes * 100) : 0) . ',
		color:"#F38630"
	},
	{
		value : ' . ($totalBytes ? (($totalBytes - $curBytes) / $totalBytes * 100) : 0) . ',
		color : "#E0E4CC"
	}
]


var ctx = document.getElementById("myChart").getContext("2d");
var myNewChart = new Chart(ctx).Pie(data);
			</script>';
            //echo '<img src="http://chart.apis.google.com/chart?cht=p3&chd=t:'.($curBytes/$totalBytes*100).','.(($totalBytes-$curBytes)/$totalBytes*100).'&chs=500x120&chl=Used:'.setupSize($curBytes).'|Free:'.setupSize($totalBytes-$curBytes).'&chf=bg,s,f9f9f9&chco=0000ff&time=1434067934" style="float:right" />';
            echo '<strong>(' . $debug_init . ')API参数</strong>:' . $this->client->api_type . '=>' . $this->client->api_name . '=>' . json_encode($this->client->api_params) . '<br>';

            if ($api_data) {

                $l_secache_time = 0;
                if(!empty($api_data['l_secache_time'])) {
                    $l_secache_time = $api_data['l_secache_time'];
                }

                $api_data_secache = 0;
                if(!empty($api_data['secache'])) {
                    $api_data_secache = $api_data['secache'];
                }

                $api_data_secache_time = 0;
                if(!empty($api_data['secache_time'])) {
                    $api_data_secache_time = $api_data['secache_time'];
                }

                $api_data_secache_date = 0;
                if(!empty($api_data['secache_date'])) {
                    $api_data_secache_date = $api_data['secache_date'];
                }

                echo '<strong>本地缓存已经</strong>:'.(time()-$l_secache_time).'秒<br>';
                echo '<strong>API错误</strong>:' . (!empty($api_data['error']) ? : '') . '<br>';
                echo '<strong>cache</strong>:' . $api_data['cache'] . '<br>';
                echo '<strong>secache</strong>:' . $api_data_secache . '<br>';
                echo '<strong>secache_time</strong>:' . $api_data_secache_time . '<br>';
                echo '<strong>secache_date</strong>:' . $api_data_secache_date . '<br>';

                if ($api_l_data) {
                    echo '<strong>l_cache</strong>:' . $api_l_data['l_cache'] . '<br>';
                    echo '<strong>l_secache</strong>:' . $api_l_data['l_secache'] . '<br>';
                    echo '<strong>l_secache_time</strong>:' . $api_l_data['l_secache_time'] . '<br>';
                    echo '<strong>l_secache_date</strong>:' . $api_l_data['l_secache_date'] . '<br>';
                } else {
                    echo '<strong>l_cache</strong>:-<br>';
                }
                echo '<strong>API接口用时</strong>:' . $api_data['execution_time'] . '<br>';
                echo '<strong>API下载用时</strong>:' . (!empty($api_data['l_down_time']) ? : '') . '<br>';
                echo '<strong>API总共耗时</strong>:' . $api_data['l_execution_time'] . '(当使用本地缓存时此值比上面少)<br>';
            }
            echo '<textarea style="width:100%;height:250px">' . htmlspecialchars(print_r($api_data, true)) . '</textarea>';
            echo '</fieldset>';
            echo '<fieldset><legend>api_l_data:</legend>';
            echo '<textarea style="width:100%;height:250px">' . htmlspecialchars(print_r($api_l_data, true)) . '</textarea>';

            echo '</fieldset>';
            echo '<fieldset><legend>api_db_data:</legend>';
            echo '<textarea style="width:100%;height:250px">' . htmlspecialchars(print_r($api_db_data, true)) . '</textarea>';

            echo '</fieldset>';
            echo '<fieldset><legend>api_text:</legend>';
            echo '<textarea style="width:100%;height:250px">' . htmlspecialchars(print_r($api_text, true)) . '</textarea>';
            echo '</fieldset>';
            echo '<fieldset><legend>CURL:</legend>';
            echo '<textarea style="width:100%;height:250px">' . print_r($m_curl, true) . '</textarea>';
            echo '</fieldset>';
            echo '<hr>';
            echo '</div>';

        } else if ($this->client->debug == 3) {

            $log_path = DIR_RUNTIME . "/logs/api-log.txt={$this->client->api_type}-{$this->client->api_name}";

            $log_path_data  = $log_path . ".log";
            $log_path_error = $log_path . "_error.log";

            $data = $this->tail($log_path_error, 300); //最新的300行数据

            foreach ($data as $key => $line) {

                $error_data[] = $line;

            }

            $error_data = array_reverse($error_data);

            $data_str = '';
            foreach ($error_data as $line) {
                $data_str .= $line;

            }

            echo '<div class="container debug_info" style="margin:5px 10px;background:#FC6">';
            echo '<h1>otaoAPI DEBUG info</h1>';

            echo '<fieldset><legend>ERROR info:</legend>';
            echo '<textarea style="width:100%;height:250px">' . print_r($data_str, true) . '</textarea>';
            echo '</fieldset>';

            echo '</div>';

        } else { //简略模式
            echo '<div class="container debug_info" style="margin:5px 10px">';
            if ($debug_init == 0) {
                echo '<h1>otaoAPI DEBUG info</h1>';
                echo '<h2>current Date:' . date('Y-m-d H:i:s') . '/UnixTime:' . time() . '</h2><br>';
            }

            echo '<strong>(' . $debug_init . ')API参数</strong>:' . $this->client->api_type . '=>' . $this->client->api_name . '=>' . json_encode($this->client->api_params) . '<br>';
            if ($api_data) {

                $cached = $api_data['cache'] == 1 ? (time() - $api_data['l_secache_time']) : 0;
                //$cached =  time()-$api_data['l_secache_time'];
                if ($cached > 0) {
                    echo '<strong><font color=green>本地缓存已经</font></strong>:' . $cached . '秒<br>';
                } else {
                    echo '<strong><font color=orange>本地缓存已经</font></strong>:' . $cached . '秒<br>';
                }

                echo '<strong>API错误</strong>:' . $api_data['error'] . '<br>';
                echo '<strong>cache</strong>:' . $api_data['cache'] . '<br>';
                // echo '<strong>secache</strong>:'.$api_data['secache'].'<br>';
                // echo '<strong>secache_time</strong>:'.$api_data['secache_time'].'<br>';
                // echo '<strong>secache_date</strong>:'.$api_data['secache_date'].'<br>';
                if ($api_l_data) {
                    echo '<strong>l_cache</strong>:' . $api_l_data['l_cache'] . '<br>';
                    // echo '<strong>l_secache</strong>:'.$api_l_data['l_secache'].'<br>';
                    // echo '<strong>l_secache_time</strong>:'.$api_l_data['l_secache_time'].'<br>';
                    // echo '<strong>l_secache_date</strong>:'.$api_l_data['l_secache_date'].'<br>';
                } else {
                    echo '<strong>l_cache</strong>:-<br>';
                }

                echo '<strong>api_text长度</strong>:' . strlen($api_text) . '<br>';
                echo '<strong>API接口用时</strong>:' . $api_data['execution_time'] . '<br>';
                echo '<strong>API下载用时</strong>:' . $api_data['l_down_time'] . '<br>';
                echo '<strong>API总共耗时</strong>:' . $api_data['l_execution_time'] . '(当使用本地缓存时此值比上面少)<br>';
            }
            echo '<hr></div>';
        }
        $debug_init++;
    }

    public function log($writetext, $filename)
    {
        $position = strrpos($filename, DS);
        $path     = substr($filename, 0, $position);
        if (!file_exists($path)) {
            mkdir($path, 0777, true);
        }

        file_put_contents($filename, $writetext. "\r\n", FILE_APPEND);
    }
/**
	 * 将數組输出为表格
	 * @param array $games 数组内容
	 * @param array $keys  数组标题，不指定则默认以数组KEY作为标题
	 * @param array $showTitle 是否显示标题
	 */
	public function outtable($games, $keys=null,$showTitle=true) {
        $echo = '';
		if($keys==null){
			if(!is_array($games) || count($games)<1){
				
				return print_r($games,true);
			}
			if(!$games[key($games)]){
				$echo .= 'Error Format';
				return;
			}
			if(is_array(current($games))){
				$keys = array_keys(current($games));
			}else{
				  $echo .= '<table  cellspacing="1" cellpadding="3" border="0" class="table0">';
				   $i = 0;
					foreach ($games as $game_id => $game) {
						$i++;
						$echo .= '<tr bgcolor="' . (($i % 2) ? "#EEEEEE" : '#FFFFFF') . '">';
						   $echo .= '<th align="right">'.$game_id.'</th>';
							$echo .= '<td>';
							if (is_array($game))
								$echo .= $this->TBI->outtable($game);
							else
								$echo .= $game;
							$echo .= '</td>';
					
						$echo .= '</tr>';
					}
					$echo .= '</table>';
					return;
			}
		}
		if(!is_array($games)){
				return print_r($games,true);
		}
			
		$echo .= '<table  cellspacing="1" cellpadding="3" border="0" class="table0">';
		$echo .= '<tr id=head style="">';
	   if($showTitle){
			$echo .= '<th>key</th>';
			foreach ($keys as $k => $v) {
				$echo .= '<th>';
				$echo .= $v;
				$echo .= '</th>';
			}
			$echo .= '</tr>';
	   }    $i = 0;
		foreach ($games as $game_id => $game) {
			$i++;
	
			$echo .= '<tr bgcolor="' . (($i % 2) ? "#EEEEEE" : '#FFFFFF') . '">';
			if($showTitle)   $echo .= '<th>'.$game_id.'</th>';
			
			if(is_array($game)){
			foreach ($keys as $k => $v) {
				$echo .= '<td nowrap="" class="data-'.$v.'" >';
				if (is_array($game[$v]))
					$echo .= $this->outtable($game[$v],null,false);
				else
					$echo .= $game[$v];
				$echo .= '</td>';
			}
			}else{
				$echo .= '<td colspan="'.count($keys).'">';
					$echo .= $game;
				$echo .= '</td>';
			}
			
			$echo .= '</tr>';
		}
		$echo .= '</table>';
		return $echo ;
	}
	public function json_encode_ex($value)
	{
 	/**
		* 对变量进行 JSON 编码
		* @param mixed value 待编码的 value ，除了resource 类型之外，可以为任何数据类型，该函数只能接受 UTF-8 编码的数据
		* @return string 返回 value 值的 JSON 形式
		*/
		if(!function_exists('json_encode_ex')){
			function json_encode_ex($value)
			{
			    if (version_compare(PHP_VERSION,'5.4.0','<'))
			    {
			        $str = json_encode($value);
			        $str = preg_replace_callback(
			                                    "#\\\u([0-9a-f]{4})#i",
			                                    function($matchs)
			                                    {
			                                         return iconv('UCS-2BE', 'UTF-8', pack('H4', $matchs[1]));
			                                    },
			                                     $str
			                                    );
			        return $str;
			    }
			    else
			    {
			        return json_encode($value, JSON_UNESCAPED_UNICODE);
			    }
			}	
		}
		return json_encode_ex($value);
	}
    //读取文件最后N行
    public function tail($file, $num)
    {
        $fp    = fopen($file, "r");
        $pos   = -2;
        $eof   = "";
        $head  = false; //当总行数小于Num时，判断是否到第一行了
        $lines = array();
        while ($num > 0) {
            while ($eof != "\n") {
                if (fseek($fp, $pos, SEEK_END) == 0) { //fseek成功返回0，失败返回-1
                    $eof = fgetc($fp);
                    $pos--;
                } else { //当到达第一行，行首时，设置$pos失败
                    fseek($fp, 0, SEEK_SET);
                    $head = true; //到达文件头部，开关打开
                    break;
                }

            }
            array_unshift($lines, fgets($fp));
            if ($head) {break;} //这一句，只能放上一句后，因为到文件头后，把第一行读取出来再跳出整个循环
            $eof = "";
            $num--;
        }
        fclose($fp);
        return $lines;
    }

    //取API独立类处理辅助事件
    public function item($item_type){
    	static $apis = array();
	    if (empty($apis[$item_type])) {
	        $item_path = dirname(__FILE__)  . '/item/' . $item_type . '.php';
	     	if(file_exists($item_path)){
	        	include_once $item_path;
	        	  $class      = 'item_' . $item_type;
	     	}else{ 
	     		//不存在 的类，使用基类
	     		$item_path =  dirname(__FILE__) . '/item/item_base.php';
	        	include_once $item_path;
	        	$class      = 'item_base';
	     	}
	        $apis[$item_type] = new $class();
	    }
	    return $apis[$item_type];
    }   
    public function get_use_time($min = false, $reset = false)
    {
        global $time_start;
        static $time_start2;
        if (!$time_start2) {
            $time_start2 = $time_start;
        }

        $time_end = $this->getmicrotime();
        $times    = $time_end - ($reset ? $time_start2 : $time_start);
        $times    = sprintf('%.5f', $times);
        if ($min == false) {
            $use_time = "用时:" . $times . "秒";
        } else {
            $use_time = $times;
        }
        $time_start2 = $time_end;

        return $use_time;
    }

    function getmicrotime()
    {
        list($usec, $sec) = explode(" ", microtime());
        return ((float) $usec + (float) $sec);
    }
}
