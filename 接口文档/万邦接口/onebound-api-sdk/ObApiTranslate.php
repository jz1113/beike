<?php
namespace otao;

include_once dirname(__FILE__) . "/translate/baseTranslateAPI.php";
include_once dirname(__FILE__) . "/translate/translateAPI.php";
include_once dirname(__FILE__) . "/translate/translator.php";
include_once dirname(__FILE__) . "/translate/request.php";

class ObApiTranslate
{
    public $client;
    public $translateAPI;
    public function __construct($client)
    {
        $this->client       = &$client;
        $this->translateAPI = new translateAPI();

    }

    public function __set($k, $v)
    {
        $this->translateAPI->$k = $v;

    }
    public function __call($f, $arguments)
    {

        return call_user_func_array(array($this->translateAPI, $f), $arguments);

        return $arguments[1];
    }

}
