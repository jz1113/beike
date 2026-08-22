<?php
// namespace Otc;
class Request
{
    public static function execute($url, $request_data = array(), $detect_encode = false)
    {
	static $status;

		if($status=='Http Status Code: 302'){
			return array('error' => 'limit'); 
		}

		$rurl = !empty($_SERVER['REDIRECT_SCRIPT_URL'])?$_SERVER['REDIRECT_SCRIPT_URL']:$_SERVER['REQUEST_URI'];
		$data = date('Y-m-d H:i:s')."\r\nPATH:".$rurl."\r\n\r\n";
		$data .= 'URL:'.$url."\r\n\r\n";
		$data .= 'DATA:'.json_encode($request_data)."\r\n\r\n";

		$request_data['encoding']='gzip';
        try
        {
            $response = self::curl($url, $request_data);
        } catch (Exception $e) {
		if(isset($_GET['debug'])){
				$data .= 'ERROR:'.$e->getMessage()."\r\n\r\n";
				echo '<textarea style="width:100%;height:200px" ondblclick="this.style.height=\'500px\'">'.htmlspecialchars($data).'</textarea>'.'<br>';	
				var_dump($e->getMessage());
				echo '<br>';	
				exit();
			}
			$status = $e->getMessage();
            return array('error' => $e->getMessage());
        }
        if ($detect_encode) {
            $encode = strtoupper(mb_detect_encoding($response, array('UTF-8', 'GBK', 'GB2312')));
            if ($encode == 'EUC-CN') {
                $encode = 'GB2312';
            } else if ($encode == 'CP936') {
                $encode = 'GBK';
            }
            if ($encode != 'UTF-8') {
                $response = iconv($encode, 'UTF-8//IGNORE', $response);
            }
        }


        $data .= 'RESPONSE:' . $response . "\r\n\r\n";
        $data .= "\r\n\r\n";
        $urls  = parse_url($url);
        $host  = $urls['host'];
        $route = '';

        if (!empty($urls['query'])) {
            // echo 'query:'.$urls['query'].'<br>
            // ';
            parse_str($urls['query'], $query);
            if (!empty($query['route'])) {
                $route = str_replace('/', '-', $query['route']);
            }

        }
        if (isset($_GET['debug'])) {

            echo '<textarea style="width:100%;height:200px" ondblclick="this.style.height=\'500px\'">' . htmlspecialchars($data) . '</textarea>' . '<br>';
        }

        //echo nl2br( $data),'<hr>';

        // file_put_contents(DIR_LOGS.'otcs_'.$host.'_'.$route.'_'.date('YmdHis').'.log', $data);
        return $response;
    }
    protected static function curl($url, $data = array())
    {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        if (!(empty($data['header']))) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $data['header']);
        }
        if (!(empty($data['referer']))) {
            curl_setopt($ch, CURLOPT_REFERER, $data['referer']);
        }
        if (!(empty($data['show_header']))) {
            curl_setopt($ch, CURLOPT_HEADER, 1);
        } else {
            curl_setopt($ch, CURLOPT_HEADER, 0);
        }
        curl_setopt($ch, CURLOPT_FAILONERROR, 1);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        //curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
        if (strstr($url, 'https')) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            if (!(empty($data['ssl_cipher']))) {
                curl_setopt($ch, CURLOPT_SSL_CIPHER_LIST, $data['ssl_cipher']);
            }
        }
        if (!(empty($data['cookie_file']))) {
            curl_setopt($ch, CURLOPT_COOKIESESSION, true);
            curl_setopt($ch, CURLOPT_COOKIEJAR, $data['cookie_file']);
        }
        if (!(empty($data['cookie']))) {
            curl_setopt($ch, CURLOPT_COOKIEFILE, $data['cookie']);
        }
        if (!(empty($data['post_data']))) {
            curl_setopt($ch, CURLOPT_POST, true);
            if (is_array($data['post_data'])) {
                $data['post_data'] = http_build_query($data['post_data']);
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $data['post_data']);
        }
        if (!(empty($data['encoding']))) {
            curl_setopt($ch, CURLOPT_ENCODING, $data['encoding']);
        }
        if (!(empty($data['user_agent']))) {
            curl_setopt($ch, CURLOPT_USERAGENT, $data['user_agent']);
        } else {
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.93 Safari/537.36');
        }
        if (!(empty($data['timeout']))) {
            curl_setopt($ch, CURLOPT_TIMEOUT, $data['timeout']);
        } else {
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        }
        if (!(empty($data['curl_options']))) {
            curl_setopt_array($ch, $data['curl_options']);
        }
        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            throw new \Exception(curl_error($ch), 0);
        } else {
            $httpStatuss = curl_getinfo($ch);

            $httpStatusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if (200 !== $httpStatusCode) {
                //淘宝要求登录的相关错误不处理
                if (strpos($httpStatuss["redirect_url"], 'login.taobao.com') !== false) {

                } else {
                    throw new \Exception('Http Status Code: ' . $httpStatusCode, $httpStatusCode);
                }
            }
        }

        curl_close($ch);
        return $response;
    }
}
