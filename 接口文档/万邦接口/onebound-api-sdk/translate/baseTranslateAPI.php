<?php
/**
 * oTao数据翻译处理API
 */
if (!defined('TRANSLATOR_ENGINE')) {
    define('TRANSLATOR_ENGINE', 'google_free');
}

class baseTranslateAPI
{

    public $default_lang = 'cn';
    public $lang         = 'cn';
    public $desc_lang    = 'cn';
    public $prop_lang    = 'cn';
    public $translator;
    public $translator_desc;
    public $translator_prop;
    public $translator_cn;

    public $translator_engine;
    public $translator_desc_engine;
    public $translator_prop_engine;
    public $translator_cn_engine;

    protected $data     = null; //翻译前的
    public $debug          = false;
    public $use_cache      = true;
    public $account_config = null;

    public function __construct()
    {
        // $this->translator_engine = TRANSLATOR_ENGINE;
        // $this->translator_desc_engine = defined('TRANSLATOR_DESC_ENGINE')? TRANSLATOR_DESC_ENGINE : TRANSLATOR_ENGINE;
        // $this->translator_prop_engine = defined('TRANSLATOR_DESC_ENGINE')? TRANSLATOR_DESC_ENGINE : TRANSLATOR_ENGINE;
        // $this->translator_cn_engine = defined('TRANSLATOR_CN_ENGINE')? TRANSLATOR_CN_ENGINE : TRANSLATOR_ENGINE;
        // $this->translator_cn_engine = defined('TRANSLATOR_CN_ENGINE')? TRANSLATOR_CN_ENGINE : TRANSLATOR_ENGINE;
        // $this->use_cache = isset($_GET['cache_no'])?$_GET['cache_no']:true;

    }
    public function set_account_config($config)
    {
        $this->account_config = $config;
    }

    protected function translator()
    {
        if (!$this->translator) {
            $this->translator = new Translator();
            // $this->translator->setTranslator($this->translator_desc_engine);
            if ($this->account_config) {
                $this->translator->set_account_config($this->account_config);
            }

            $this->translator->from      = $this->default_lang;
            $this->translator->to        = $this->lang;
            $this->translator->debug     = $this->debug;
            $this->translator->use_cache = $this->use_cache;
        }

        return $this->translator;
    }
    public function translator_desc()
    {
        if (!$this->translator_desc) {
            $this->translator_desc = new Translator();
            // $this->translator_desc->setTranslator($this->translator_engine);
            if ($this->account_config) {
                $this->translator->set_account_config($this->account_config);
            }

            $this->translator_desc->from      = $this->default_lang;
            $this->translator_desc->to        = $this->desc_lang;
            $this->translator_desc->debug     = $this->debug;
            $this->translator_desc->use_cache = $this->use_cache;
        }
        return $this->translator_desc;
    }
    protected function translator_prop()
    {
        if (!$this->translator_prop) {
            $this->translator_prop = new Translator();
            // $this->translator_prop->setTranslator($this->translator_prop_engine);
            if ($this->account_config) {
                $this->translator->set_account_config($this->account_config);
            }

            $this->translator_prop->from      = $this->default_lang;
            $this->translator_prop->to        = $this->prop_lang;
            $this->translator_prop->debug     = $this->debug;
            $this->translator_prop->use_cache = $this->use_cache;
        }
        return $this->translator_prop;
    }
    public function translate_default($text, $lang, $default_lang = null)
    {
        if (!$this->translator_cn) {
            $this->translator_cn = new Translator();
            // $this->translator_cn->setTranslator($this->translator_cn_engine);
            if ($this->account_config) {
                $this->translator->set_account_config($this->account_config);
            }

        }
        if (!$default_lang) {
            $default_lang = $this->default_lang;
        }

        $this->translator_cn->to        = $default_lang;
        $this->translator_cn->debug     = $this->debug;
        $this->translator_cn->from      = $lang;
        $this->translator_cn->use_cache = $this->use_cache;
        if (is_array($text)) {
            return $this->translator_cn->translate_array($text);
        }

        return $this->translator_cn->translate($text);
    }
    public function translate($api_name, $data)
    {

        $this->data               = $data;
        $data['translate_status'] = '';
        if (!empty($data['error']) || ($this->lang == $this->default_lang && $this->desc_lang == $this->default_lang && $this->prop_lang == $this->default_lang)) {
            $data['language'] = array(
                'default_lang' => $this->default_lang,
                'current_lang' => $this->lang,
                'source_data'  => array(),
            );
        } else {
            $data['language'] = array(
                'current_lang' => $this->lang,
                'source_lang'  => $this->default_lang,
                'source_data'  => $data,
            );
            $data = $this->$api_name($data);
        }

        return $data;
    }
    public function item_sku($data)
    {
        return $data;
    }
    public function item_get($data)
    {
        if ($this->lang == 'my' && $_REQUEST['key'] == '360.com.mm') {
            $this->lang = 'en';

        }
        $t_array   = array();
        $t_array[] = ($this->lang == 'my' ? '###short###' : '') . $data['item']['title'];
        if ($data['item']['desc_short']) {
            $t_array[] = $data['item']['desc_short'];
        }

        if (is_array($data['item']['crumbs'])) {
            foreach ($data['item']['crumbs'] as $val) {
                $t_array[] = $val;
            }
        }

        if ($data['item']['property_alias']) {
            $d_arr_alias = explode(';', $data['item']['property_alias']);
        }
//属性别名
        else {
            $d_arr_alias = array();
        }

        $d_arr_alias_arr = array();
        /*foreach($d_arr_alias as $val){
        $val=explode(':',$val);
        $d_arr_alias_arr[$val[0]][$val[1]]=$val[2];
        $t_array[]=$val[2];
        }*/

        if (is_array($data['item']['props'])) {
            foreach ($data['item']['props'] as $val) {
                $t_array[] = $val['name'];
                $t_array[] = $val['value'];
            }
        }

        if (is_array($data['item']['shop_item'])) {
            foreach ($data['item']['shop_item'] as $val) {
                $t_array[] = $val['title'];
            }
        }

        if (is_array($data['item']['relate_items'])) {
            foreach ($data['item']['relate_items'] as $val) {
                $t_array[] = $val['title'];
            }
        }

        $t_array   = array_unique($t_array);
        $t_array_t = $this->translator()->translate_array($t_array);
        if ($this->prop_lang != $this->lang) {
            $t_array_tp = $this->translator_prop()->translate_array($t_array);
        }

        if (count($t_array_t) == count($t_array)) {
            foreach ($t_array as $k => $v) {
                $t_array[$k] = str_replace('###short###', '', $v);
            }

            foreach ($t_array_t as $k => $v) {
                if (!$v) {
                    $t_array_t[$k] = $t_array[$k];
                }
            }

            $t_array = array_combine($t_array, $t_array_t);

            $data['item']['title'] = $t_array[$data['item']['title']];
            if ($data['item']['desc_short']) {
                $data['item']['desc_short'] = $t_array[$data['item']['desc_short']];
            }

            if (is_array($data['item']['crumbs'])) {
                foreach ($data['item']['crumbs'] as $key => $val) {
                    $data['item']['crumbs'][$key] = $t_array[$data['item']['crumbs'][$key]];
                }
            }

            foreach ($d_arr_alias_arr as $k => $v) {
                foreach ($v as $kk => $vv) {
                    $d_arr_alias_arr[$k][$kk] = $t_array[$d_arr_alias_arr[$k][$kk]];
                    if ($this->prop_lang != $this->lang) {
                        //array_shift($t_array_tp);
                    }
                }
            }

            if (is_array($data['item']['props'])) {
                foreach ($data['item']['props'] as $key => $val) {
                    $data['item']['props'][$key]['name']  = ($t_array[$data['item']['props'][$key]['name']]);
                    $data['item']['props'][$key]['value'] = ($t_array[$data['item']['props'][$key]['value']]);
                    if ($this->prop_lang != $this->lang) {
                        //$data['item']['props'][$key]['name']= array_shift($t_array_tp);
                        //array_shift($t_array_tp);
                    }

                }
            }

            if (is_array($data['item']['shop_item'])) {
                foreach ($data['item']['shop_item'] as $key => $val) {
                    $data['item']['shop_item'][$key]['title'] = array_shift($t_array_t);
                }
            }

            if (is_array($data['item']['relate_items'])) {
                foreach ($data['item']['relate_items'] as $key => $val) {
                    $data['item']['relate_items'][$key]['title'] = array_shift($t_array_t);
                }
            }

        } else {

            $data['item']['title'] = $this->translator()->translate($data['item']['title']);

            $d_arr_alias_arr = array();
            foreach ($d_arr_alias as $val) {
                $val                               = explode(':', $val);
                $aliasname                         = $this->translator()->translate($val[2]);
                $d_arr_alias_arr[$val[0]][$val[1]] = $val[2];

            }

            foreach ($data['item']['props'] as $key => $val) {
                $data['item']['props'][$key]['name']  = $this->translator()->translate($val['name']);
                $data['item']['props'][$key]['value'] = $this->translator()->translate($val['name']);

                if ($this->prop_lang != $this->lang) {
                    //    $data['item']['props'][$key]['name']= $this->translator_prop()->translate($val['name']);
                }
            }

        }

        // [property_alias] => 20509:28314:S;20509:28315:M（预售9月30日发货);20509:28316:L（预售9月30日发货);20509:28317:XL;20509:28318:XXL（预售9月30日发货);1627207:28335:绿色长袖 A B

        if ($d_arr_alias_arr) {
            /*$property_alias =array();
        foreach($d_arr_alias_arr as $k=>$v){
        foreach($v as $kk=>$vv){
        $property_alias[]=$k.':'.$kk.':'.$vv;
        }
        }
        $data['item']['property_alias'] = implode(';',$property_alias);*/
        }

        $data['item']['props_name'] = str_replace('&nbsp;', ' ', $data['item']['props_name']);
        $data['item']['props_name'] = str_replace('&amp;', '&', $data['item']['props_name']);
        $d_arr                      = array();
        if ($data['item']['props_name']) {
            $d_arr = explode(';', $data['item']['props_name']);

            $t_array = array();
            foreach ($d_arr as $val) {
                $arrtemp = explode(':', $val);
                if (!is_numeric($arrtemp[2])) {
                    $t_array[] = $arrtemp[2];
                }

                if (!is_numeric($arrtemp[3])) {
                    $t_array[] = $arrtemp[3];
                }

            }
        }
        $t_array   = array_unique($t_array);
        $t_array_t = $this->translator()->translate_array($t_array);

        if ($this->prop_lang != $this->lang) {
            $t_array_tp = $this->translator_prop()->translate_array($t_array);
        }

        if (count($t_array_t) == count($t_array)) {

            if ($this->prop_lang != $this->lang) {
                $t_arrayp = array_combine($t_array, $t_array_tp);
            }

            $t_array = array_combine($t_array, $t_array_t);
        }
        if ($d_arr) {
            foreach ($d_arr as $dk => $val) {
                $val = explode(':', $val);
                if (!is_numeric($val[3])) {
                    $val[3] = $t_array[$val[3]];
                }

                if ($this->prop_lang != $this->lang) {
                    if (!is_numeric($val[2])) {
                        $val[2] = $t_arrayp[$val[2]];
                    }

                } else {

                    if (!is_numeric($val[2])) {
                        $val[2] = $t_array[$val[2]];
                    }

                }

                $d_arr[$dk] = implode(':', $val);
            }

            $data['item']['props_name'] = implode(';', $d_arr);
        }

        //sku
        if ($data['item']['skus']['sku']) {
            $t_array_d = $t_array;
            $t_array   = array();
            $t_arrayp  = array();

            $data['item']['props_list'] = array();
            foreach ($data['item']['skus']['sku'] as $val) {
                $tmp = explode(';', $val['properties_name']);
                foreach ($tmp as $tk => $tv) {
                    $tmp2 = explode(':', $tv);

                    $t_array[] = $tmp2[2];
                    $t_array[] = $tmp2[3];
                }
            }

            $t_array   = array_unique($t_array);
            $t_array_t = $this->translator()->translate_array($t_array);

            if ($this->prop_lang != $this->lang) {
                $t_array_tp = $this->translator_prop()->translate_array($t_array);
            }

            if (count($t_array_t) == count($t_array)) {
                if ($this->prop_lang != $this->lang) {
                    $t_arrayp = array_combine($t_array, $t_array_tp);
                }

                $t_array = array_combine($t_array, $t_array_t);
            }

            foreach ($t_array as $k => $v) {
                $t_array[$k] = str_replace(':', '：', $v);
            }
//&#58;
            foreach ($t_arrayp as $k => $v) {
                $t_arrayp[$k] = str_replace(':', '：', $v);
            }

            $property_alias_data = array();
            foreach ($data['item']['skus']['sku'] as $k => $val) {
                $tmp = explode(';', $val['properties_name']);
                foreach ($tmp as $tk => $tv) {
                    $tmp2 = explode(':', $tv);

                    $tmp2[3] = $t_array[$tmp2[3]];

                    if ($this->prop_lang != $this->lang) {
                        $tmp2[2] = $t_arrayp[$tmp2[2]];
                    } else {
                        $tmp2[2] = $t_array[$tmp2[2]];
                    }

                    $tmp[$tk] = implode(':', $tmp2);

                    $data['item']['props_list'][$tmp2[0] . ':' . $tmp2[1]] = $tmp2[2] . ':' . $tmp2[3];

                }

                $data['item']['skus']['sku'][$k]['properties_name'] = implode(';', $tmp);

                foreach ($tmp as $p) {
                    $p = explode(':', $p);

                    $property_alias_data[] = $p[0] . ':' . $p[1] . ':' . $p[3];
                }

            }

            $data['item']['property_alias'] = implode(';', $property_alias_data);

        }

        if ($this->desc_lang != 'cn') {
            $data['item']['desc'] = $this->translator_desc()->translate($data['item']['desc']);
        }

        if ($data['item']['title'] && $data['item']['title'] != $this->data['item']['title']) {
            $data['translate_status'] = 'ok';
        } else {
            $data['translate_status'] = 'error';
        }

        return $data;
    }
    public function item_review($data)
    {

        if ($data['items']['comments']) {
            $key = 'comments';
            $val = 'content';
        } else {
            $key = 'rateList';
            $val = 'rateContent'; //tmall
        }

        $t_array = array();
        foreach ($data['items'][$key] as $ck => $cv) {
            $t_array[] = $cv[$val];
        }

        $t_array_t = $this->translator()->translate_array($t_array);

        if (count($t_array_t) == count($t_array)) {
            $t_array_status = true;
        } else {
            foreach ($t_array as $tk => $tv) {
                $t_array_t[$tk] = $this->translator()->translate($tv);
            }

        }
        foreach ($data['items'][$key] as $ck => $cv) {
            $data['items'][$key][$ck][$val] = $t_array_t[$ck];
        }

        return $data;
    }
    public function seller_info($data)
    {
        return $data;
    }

    public function item_search($data)
    {

        // if($this->lang=='my'&&$_REQUEST['key']=='360.com.mm'){
        //     $this->lang='en';

        // }

        $t_array  = array();
        $products = array_values($data['items']['item']);
        foreach ($products as $val) {
            $t_array[] = /*($this->lang=='my'?'###short###':'').*/$val['title'];

        }
        if (!empty($data['items']['related_keywords']) && is_array($data['items']['related_keywords'])) {
            foreach ($data['items']['related_keywords'] as $val) {
                $t_array[] = $val;
            }
        }

        if (!empty($data['items']['nav_catcamp']) && is_array($data['items']['nav_catcamp'])) {
            foreach ($data['items']['nav_catcamp'] as $val) {
                $t_array[] = $val['name'];
            }
        }

        if (!empty($data['items']['nav_filter']) && is_array($data['items']['nav_filter'])) {
            foreach ($data['items']['nav_filter'] as $val) {
                $t_array[] = $val['title'];
                $t_array[] = $val['type'];
                foreach ($val['data'] as $val2) {
                    $t_array[] = $val2['title'];
                    //$t_array[]=$val2['value'];
                }
            }
        }

        if (is_array($data['items']['navs'])) {
            foreach ($data['items']['navs'] as $type => $nav) {
                foreach ($nav as $val) {
                    $t_array[] = $val['title'];
                    foreach ($val['item'] as $val2) {
                        $t_array[] = $val2['title'];
                    }
                }
            }
        }

        if (is_array($data['items']['breadcrumbs'])) {
            if (!empty($data['items']['breadcrumbs']['catpath']) && is_array($data['items']['breadcrumbs']['catpath'])) {
                foreach ($data['items']['breadcrumbs']['catpath'] as $val) {
                    $t_array[] = $val['name'];
                }
            }

            if (!empty($data['items']['breadcrumbs']['propSelected']) && is_array($data['items']['breadcrumbs']['propSelected'])) {
                foreach ($data['items']['breadcrumbs']['propSelected'] as $val) {
                    $t_array[] = $val['text'];
                    foreach ($val['sub'] as $val2) {
                        $t_array[] = $val2['text'];
                    }
                }
            }

        }

        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {

            foreach ($t_array_t as $k => $v) {
                if (!$v) {
                    $t_array_t[$k] = $t_array[$k];
                }
            }

            $t_array_status = true;
        } else {
            foreach ($t_array as $tk => $tv) {
                $t_array_t[$tk] = $this->translator()->translate($tv);
            }

        }
        $translate_error = 0;
        foreach ($t_array_t as $tk => $tv) {
            if ($t_array[$tk] && !$tv) {
                $translate_error++;
            }
        }

        $product_status = true;
        if ($translate_error > count($t_array) / 2) {
            $product_status = false;
        }
//有一半的翻译不出来则不更新缓存

        foreach ($data['items']['item'] as $k => $v) {
            $data['items']['item'][$k]['title'] = $t_array_t[$k];
        }

        $ti = $k;
        if (!empty($data['items']['related_keywords']) && is_array($data['items']['related_keywords'])) {
            foreach ($data['items']['related_keywords'] as $kk => $val) {
                $data['items']['related_keywords'][$kk] = $t_array_t[++$ti];
            }
        }

        if (!empty($data['items']['nav_catcamp']) && is_array($data['items']['nav_catcamp'])) {
            foreach ($data['items']['nav_catcamp'] as $kkk => $val) {
                $data['items']['nav_catcamp'][$kkk]['name'] = $t_array_t[++$ti];
            }
        }

        if (!empty($data['items']['nav_filter']) && is_array($data['items']['nav_filter'])) {
            foreach ($data['items']['nav_filter'] as $kkkk => $val) {
                $data['items']['nav_filter'][$kkkk]['title'] = $t_array_t[++$ti];
                $data['items']['nav_filter'][$kkkk]['type']  = $t_array_t[++$ti];
                foreach ($val['data'] as $kkkkk => $val2) {
                    $data['items']['nav_filter'][$kkkk]['data'][$kkkkk]['title'] = $t_array_t[++$ti];
                    //$data['items']['nav_filter'][$kkkk]['data'][$kkkkk]['value']= $t_array_t[6+$k+$kk+$kkk+$kkkk];
                }
            }
        }

        //$ti=5+$k+$kk+$kkk+$kkkk+$kkkkk;
        if (!empty($data['items']['navs']) && is_array($data['items']['navs'])) {
            foreach ($data['items']['navs'] as $type => $nav) {
                foreach ($nav as $kkkk => $val) {
                    $data['items']['navs'][$type][$kkkk]['title'] = $t_array_t[++$ti];
                    foreach ($val['item'] as $kkkkk => $val2) {
                        $data['items']['navs'][$type][$kkkk]['item'][$kkkkk]['title'] = $t_array_t[++$ti];
                    }
                }
            }
        }

        if (!empty($data['items']['breadcrumbs']) && is_array($data['items']['breadcrumbs'])) {
            if (!empty($data['items']['breadcrumbs']['catpath']) && is_array($data['items']['breadcrumbs']['catpath'])) {
                foreach ($data['items']['breadcrumbs']['catpath'] as $k => $val) {
                    $data['items']['breadcrumbs']['catpath'][$k]['name'] = $t_array_t[++$ti];
                }
            }

            if (!empty($data['items']['breadcrumbs']['propSelected']) && is_array($data['items']['breadcrumbs']['propSelected'])) {
                foreach ($data['items']['breadcrumbs']['propSelected'] as $k => $val) {
                    $data['items']['breadcrumbs']['propSelected'][$k]['text'] = $t_array_t[++$ti];
                    foreach ($val['sub'] as $kk => $val2) {
                        $data['items']['breadcrumbs']['propSelected'][$k]['sub'][$kk]['text'] = $t_array_t[++$ti];
                    }
                }
            }

        }

        if ($data['items']['item'][0]['title'] && $data['items']['item'][0]['title'] != $this->data['items']['item'][0]['title']) {
            $data['translate_status'] = 'ok';
        } else {
            $data['translate_status'] = 'error';
        }

        return $data;
    }
    public function item_search_shop($data)
    {

        $t_array  = array();
        $products = array_values($data['items']['item']);
        foreach ($products as $val) {
            $t_array[] = $val['title'];

        }
        if (is_array($data['user']['menu'])) {
            foreach ($data['user']['menu'] as $val) {
                $t_array[] = $val['name'];
                if (!empty($val['sub'])) {
                    foreach ($val['sub'] as $val2) {
                        $t_array[] = $val2['name'];
                        if (!empty($val2['sub'])) {
                            foreach ($val2['sub'] as $val3) {
                                $t_array[] = $val3['name'];
                            }
                        }
                    }
                }
            }
        }

        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {
            $t_array_status = true;
        } else {
            foreach ($t_array as $tk => $tv) {
                $t_array_t[$tk] = $this->translator()->translate($tv);
            }

        }
        $translate_error = 0;
        foreach ($t_array_t as $tk => $tv) {
            if ($t_array[$tk] && !$tv) {
                $translate_error++;
            }
        }

        $product_status = true;
        if ($translate_error > count($t_array) / 2) {
            $product_status = false;
        }
//有一半的翻译不出来则不更新缓存

        foreach ($data['items']['item'] as $k => $v) {
            $data['items']['item'][$k]['title'] = array_shift($t_array_t);
        }

        if (is_array($data['user']['menu'])) {
            foreach ($data['user']['menu'] as $kk => $val) {
                $data['user']['menu'][$kk]['name'] = array_shift($t_array_t);
                if (!empty($val['sub'])) {
                    foreach ($val['sub'] as $kk2 => $val2) {
                        $data['user']['menu'][$kk]['sub'][$kk2]['name'] = array_shift($t_array_t);
                        if (!empty($val2['sub'])) {
                            foreach ($val2['sub'] as $kk3 => $val3) {
                                $data['user']['menu'][$kk]['sub'][$kk2]['sub'][$kk3]['name'] = array_shift($t_array_t);
                            }
                        }
                    }
                }
            }
        }

        return $data;
    }
    public function item_search_samestyle($data)
    {

        $t_array  = array();
        $products = array_values($data['items']['item']);
        foreach ($products as $val) {
            $t_array[] = $val['title'];

        }
        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {
            $t_array_status = true;
        } else {
            foreach ($t_array as $tk => $tv) {
                $t_array_t[$tk] = $this->translator()->translate($tv);
            }

        }
        $translate_error = 0;
        foreach ($t_array_t as $tk => $tv) {
            if ($t_array[$tk] && !$tv) {
                $translate_error++;
            }
        }

        $product_status = true;
        if ($translate_error > count($t_array) / 2) {
            $product_status = false;
        }
//有一半的翻译不出来则不更新缓存

        foreach ($data['items']['item'] as $k => $v) {
            $data['items']['item'][$k]['title'] = $t_array_t[$k];
        }

        return $data;
    }
    public function item_search_similar($data)
    {

        $t_array  = array();
        $products = array_values($data['items']['item']);
        foreach ($products as $val) {
            $t_array[] = $val['title'];

        }
        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {
            $t_array_status = true;
        } else {
            foreach ($t_array as $tk => $tv) {
                $t_array_t[$tk] = $this->translator()->translate($tv);
            }

        }
        $translate_error = 0;
        foreach ($t_array_t as $tk => $tv) {
            if ($t_array[$tk] && !$tv) {
                $translate_error++;
            }
        }

        $product_status = true;
        if ($translate_error > count($t_array) / 2) {
            $product_status = false;
        }
//有一半的翻译不出来则不更新缓存

        foreach ($data['items']['item'] as $k => $v) {
            $data['items']['item'][$k]['title'] = $t_array_t[$k];
        }

        return $data;
    }
    public function cat_get($data)
    {
        if ($data['items']['info']) {
            //指定分类由于 使用item_search，已经被翻译过了
            $data['items']['info']['name'] = $this->translator()->translate($data['items']['info']['name']);
        } elseif ($data['items']['item']) {
            $t_array = array();
            foreach ($data['items']['item'] as $k => $v) {
                $t_array[] = $v['name'];
                if ($v['sub']) {
                    foreach ($v['sub'] as $kk => $vv) {
                        $t_array[] = $vv;
                    }
                }

            }
            $t_array_t = $this->translator()->translate_array($t_array);
            if (count($t_array_t) == count($t_array)) {

                foreach ($data['items']['item'] as $k => $v) {
                    $data['items']['item'][$k]['name'] = array_shift($t_array_t);
                    if ($v['sub']) {
                        foreach ($v['sub'] as $kk => $vv) {
                            $data['items']['item'][$k]['sub'][$kk] = array_shift($t_array_t);
                        }
                    }

                }
            }
        }
        return $data;
    }
    /**
     * 得到品牌列表
     */
    public function brand_cat($data)
    {

        $t_array = array();
        foreach ($data['items'] as $k => $v) {
            $t_array[] = $v['name'];
        }
        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {

            foreach ($data['items'] as $k => $v) {
                $data['items'][$k]['name'] = $t_array_t[$k];
            }
        }

        return $data;
    }
    /**
     * 得到首页分类的品牌列表
     */
    public function brand_cat_top($data)
    {

        $brandCatTop = $data['items'];
        if ($this->lang == 'en') {
            $t_array = array();
            foreach ($brandCatTop as $k => $v) {
                $t_array[] = $v['name'];
                foreach ($v['item'] as $kk => $vv) {
                    if (strpos($vv['name'], '/') !== false) {

                    } else {
                        $t_array[] = $vv['name'];
                    }
                }
            }

            $t_array_t = $this->translator()->translate_array($t_array);
            if (count($t_array_t) == count($t_array)) {
                $i = 0;
                foreach ($brandCatTop as $k => $v) {
                    $brandCatTop[$k]['name'] = $t_array_t[$i++];
                    foreach ($v['item'] as $kk => $vv) {
                        if (strpos($vv['name'], '/') !== false) {
                            list($brandCatTop[$k]['item'][$kk]['name']) = explode('/', $vv['name']);
                        } else {
                            $brandCatTop[$k]['item'][$kk]['name'] = $t_array_t[$i++];
                        }
                    }
                }
            }
        } else {
            $t_array = array();
            foreach ($brandCatTop as $k => $v) {
                $t_array[] = $v['name'];
                foreach ($v['item'] as $kk => $vv) {
                    if (strpos($vv['name'], '/') !== false) {
                        list(, $t_array[]) = explode('/', $vv['name']);
                    } else {
                        $t_array[] = $vv['name'];
                    }
                }
            }

            $t_array_t = $this->translator()->translate_array($t_array);
            if (count($t_array_t) == count($t_array)) {
                $i = 0;
                foreach ($brandCatTop as $k => $v) {
                    $brandCatTop[$k]['name'] = $t_array_t[$i++];
                    foreach ($v['item'] as $kk => $vv) {
                        if (strpos($vv['name'], '/') !== false) {
                            $name                                 = explode('/', $vv['name']);
                            $brandCatTop[$k]['item'][$kk]['name'] = $name[0] . '/' . $t_array_t[$i++];
                        } else {
                            $brandCatTop[$k]['item'][$kk]['name'] = $t_array_t[$i++];
                        }
                    }
                }
            }

        }

        $data['items'] = $brandCatTop;

        return $data;
    }
    /**
     * 得到指定分类的品牌列表
     */
    public function brand_cat_list($data)
    {
        $brandCatTop   = array('items' => array($data['items']));
        $brandCatTop   = $this->get_brand_cat_top($brandCatTop);
        $brandCatTop   = $brandCatTop['items'][0];
        $data['items'] = $brandCatTop;

        return $data;
    }
    /**
     * 得到指定关键词的品牌列表
     */
    public function brand_keyword_list($data)
    {
        return $data;
    }

    /**
     * 得到品牌相关信息
     */
    public function brand_info($data)
    {
        return $data;
    }
    /**
     * 得到指定品牌的产品
     */
    public function brand_product_list($data)
    {
        return $data;
    }
    public function item_recommend($data)
    {

        $t_array = array();
        foreach ($data['items'] as $k => $v) {
            $t_array[] = $v['title'];
        }
        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {

            foreach ($data['items'] as $k => $v) {
                $data['items'][$k]['title'] = $t_array_t[$k];
            }
        }
        return $data;

    }
    public function item_search_suggest($data)
    {

        $t_array = array();
        foreach ($data['items']['result'] as $k => $v) {
            $t_array[] = $v[0];
        }
        // foreach($data['items']['magic'] as $k=>$v){
        //     foreach ($v['data'] as $kk => $vv)
        //     foreach ($vv as $kkk => $vvv)
        //          $t_array[]=$vvv['title'];

        // }
        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {

            foreach ($data['items']['result'] as $k => $v) {
                $data['items']['result'][$k][0] = $t_array_t[$k];
            }
        }
        return $data;

    }
}
