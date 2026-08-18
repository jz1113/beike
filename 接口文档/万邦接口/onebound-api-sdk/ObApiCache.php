<?php
namespace otao;

class ObApiCache
{
    public $cache_db_dbh    = null; //
    public $cache_db_config = array('host' => 'localhost', 'dbname' => 'obapi', 'username' => '', 'password' => '', 'prefix'); //本地数据库参数
    public $client;
    public $secache;
    public $secache_path = 'runtime/secache/'; //本地缓存路径
    public $secache_time = 86400; //本地缓存时间（秒）
    public $secache_name = 'option_data'; //本地缓存文件名
    public $secache_file; //当前使用的缓存文件名

    public function __construct($client)
    {
        $this->client = &$client;

    }
    public function set_db_config($config)
    {
        $this->cache_db_config = $config;
        //if($this->cache_db){
        //include_once 'ObApiDB.php';
        $dbh = "mysql:host=" . $this->cache_db_config['host'] . ";dbname=" . $this->cache_db_config['dbname'] . "";

        $this->cache_db_dbh = new ObApiDB($dbh, $this->cache_db_config['username'], $this->cache_db_config['password']);
        $this->cache_db_dbh->setCharset('UTF8');

        //}
    }

    public function init_db_struct()
    {
        $dbs =
        array("CREATE TABLE IF NOT EXISTS `{prefix}_item` (
  `num_iid` bigint(20) NOT NULL DEFAULT '0',
  `title` varchar(255) NOT NULL,
  `desc_short` varchar(255) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `orginal_price` decimal(10,2) NOT NULL,
  `nick` varchar(50) DEFAULT NULL,
  `num` int(11) NOT NULL,
  `pic_url` varchar(255) NOT NULL,
  `brand` varchar(100) NOT NULL,
  `brandId` int(11) DEFAULT NULL,
  `rootCatId` int(11) DEFAULT NULL,
  `cid` int(11) DEFAULT NULL,
  `crumbs` varchar(255) DEFAULT NULL,
  `detail_url` varchar(255) NOT NULL,
  `desc` text NOT NULL,
  `item_imgs` text,
  `type` varchar(100) DEFAULT NULL,
  `seller_cids` varchar(100) DEFAULT NULL,
  `item_weight` decimal(10,3) DEFAULT NULL,
  `item_size` varchar(20) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `post_fee` int(10) DEFAULT NULL,
  `express_fee` int(10) DEFAULT NULL,
  `ems_fee` int(10) DEFAULT NULL,
  `shipping_to` varchar(100) DEFAULT NULL,
  `has_discount` varchar(100) DEFAULT NULL,
  `video` varchar(100) DEFAULT NULL,
  `is_virtual` varchar(100) DEFAULT NULL,
  `sample_id` varchar(100) DEFAULT NULL,
  `is_promotion` varchar(100) DEFAULT NULL,
  `props_img` text,
  `property_alias` text,
  `props` text,
  `props_name` text,
  `total_sold` int(10) DEFAULT NULL,
  `skus` text NOT NULL,
  `seller_id` bigint(20) DEFAULT NULL,
  `shop_id` bigint(20) DEFAULT NULL,
  `props_list` text,
  `seller_info` varchar(255) NOT NULL,
  `tmall` varchar(100) NOT NULL,
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NULL DEFAULT NULL,
  `error` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`num_iid`),
  KEY `rootCatId` (`rootCatId`,`cid`,`create_time`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='产品详情';",

            "CREATE TABLE IF NOT EXISTS `{prefix}_seller` (
  `user_num_id` bigint(20) NOT NULL,
  `sid` bigint(20) NOT NULL,
  `title` varchar(255) NOT NULL,
  `nick` varchar(100) NOT NULL,
  `city` varchar(100) DEFAULT NULL,
  `level` int(10) NOT NULL,
  `bail` varchar(100) DEFAULT NULL,
  `rate` decimal(2,1) DEFAULT NULL,
  `score` decimal(2,1) DEFAULT NULL,
  `delivery_score` decimal(2,1) DEFAULT NULL,
  `item_score` decimal(2,1) DEFAULT NULL,
  `shop_type` varchar(10) DEFAULT NULL,
  `zhuy` varchar(100) DEFAULT NULL,
  `company_name` varchar(200) DEFAULT NULL,
  `menu` text,
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`user_num_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;",

            "CREATE TABLE IF NOT EXISTS `{prefix}_item_sku` (
  `sku_id` bigint(20) NOT NULL,
  `num_iid` bigint(20) NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `orginal_price` decimal(10,2) DEFAULT NULL,
  `quantity` int(1) DEFAULT NULL,
  `properties` varchar(255) DEFAULT NULL,
  `properties_name` varchar(255) DEFAULT NULL,
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`sku_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;",
            "CREATE TABLE IF NOT EXISTS `{prefix}_item_search` (
  `item_search_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `cat` int(11) DEFAULT NULL,
  `q` varchar(255) DEFAULT NULL,
  `start_price` int(11) DEFAULT NULL,
  `end_price` int(11) DEFAULT NULL,
  `ppath` varchar(255) DEFAULT NULL,
  `nick` varchar(100) DEFAULT NULL,
  `discount` varchar(100) DEFAULT NULL,
  `locate` varchar(100) DEFAULT NULL,
  `imgid` varchar(50) DEFAULT NULL,
  `real_total_results` int(11) DEFAULT NULL,
  `related_keywords` text,
  `crumbs` text,
  `breadcrumbs` text,
  `nav_catcamp` text,
  `navs` text,
  `url` varchar(225) DEFAULT NULL,
  `create_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`item_search_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;",
        );

        foreach ($this->client->apis as $key => $value) {
            if ($value == 'translate') {
                continue;
            }

            if ($value !== $this->client->api_type) {
                continue;
            }

            foreach ($dbs as $db) {
                $db_sql = str_replace('{prefix}', $this->cache_db_config['prefix'] . "obapi_" . $value, $db);
                $this->cache_db_dbh->getRow($db_sql);
            }
            //var_dump($dbs);
        }

    }
    public function cache_from_db()
    {
        //return;
        $this->init_db_struct();
        $table_prefix = $this->cache_db_config['prefix'] . "obapi_" . $this->client->api_type . '_';
        $json         = array();
        if ($this->client->api_name == 'item_search') {
            //return false;
           
            $keyword     = !empty($this->client->api_params['q'])?$this->client->api_params['q']:'';
            $keyword = trim($keyword);
            $cat     = !empty($this->client->api_params['cat'])?$this->client->api_params['cat']:'';
            $page     = !empty($this->client->api_params['page'])?$this->client->api_params['page']:'';
            $page    = $this->client->api_params['page'];
            //if($this->api_params['sort'])
            //排序
            //分类
            if (strpos($keyword, '_') === 0) {
                $keyword = substr($keyword, 4);
            }

            $item_total = 0;
            $where      = 'WHERE 1';
            $wheres     = array();
            if ($keyword) {
                $keywords = explode(' ', $keyword);
                foreach ($keywords as $keyword) {
                    $where .= ' AND title like ?';
                    $wheres[] = '%' . $keyword . '%';
                }

            }

            if ($cat) {
                $where .= ' AND rootCatId=? OR cid=?';
                $wheres[] = $cat;
                $wheres[] = $cat;
            }

            if ($where) {
                $item_total = $this->cache_db_dbh->getOne('SELECT count(*) num FROM ' . $table_prefix . 'item ' . $where, $wheres);

            }

             $items = null; 
            if ($item_total > 20) {
                $limit = ' LIMIT 0,40';
                if ($page > 1) {
                    $limit = ' LIMIT ' . ($page * 40 - 40) . ',' . ($page * 40) . '';
                }

                $items = $this->cache_db_dbh->getRows('SELECT num_iid,title,price,orginal_price,nick,pic_url,detail_url,post_fee FROM ' . $table_prefix . 'item ' . $where
                    . ' ' . $limit, $wheres);
            }

            if ($items && count($items) > 20) {

                foreach ($items as $k => $v) {
                    $items[$k] = array(
                        'num_iid'         => $v['num_iid'],
                        'title'           => $v['title'],
                        'promotion_price' => $v['price'],
                        'price'           => $v['orginal_price'],
                        'seller_nick'     => $v['nick'],
                        'pic_url'         => $v['pic_url'],
                        'detail_url'      => $v['detail_url'],
                        'post_fee'        => $v['post_fee'],
                    );
                }

                $json = array(
                    'items' => array
                    (
                        'page'               => $page,
                        'error'              => '',
                        'real_total_results' => $item_total,
                        'total_results'      => $item_total,
                        'item'               => $items,
                    ),
                );

                $item_search_keys = array('cat', 'q', 'start_price', 'end_price', 'ppath', 'nick', 'discount', 'locate', 'imgid');
                $item_search_data = array('cat' => '', 'q' => '', 'start_price' => '', 'end_price' => '', 'ppath' => '', 'nick' => '', 'discount' => '', 'locate' => '', 'imgid' => '');
                foreach ($this->client->api_params as $key => $value) {
                    if (in_array($key, $item_search_keys)) {
                        $item_search_data[$key] = $value;
                    }
                }
// AND q=?

                $item_search = $this->cache_db_dbh->getRow('SELECT * FROM ' . $table_prefix . 'item_search WHERE
				cat=:cat AND q=:q AND start_price=:start_price AND end_price=:end_price AND ppath=:ppath
				AND nick=:nick AND discount=:discount AND locate=:locate AND imgid=:imgid', $item_search_data);

                //var_dump($this->api_params,$item_search,$page);exit();

                $json['items']['real_total_results'] = $item_search['real_total_results'];
                $json['items']['total_results']      = $item_search['real_total_results'] > 4400 ? 4400 : $item_search['real_total_results'];
                if (!$item_search || !$item_search['real_total_results']) {
                    $json = array(); //没有处理过的搜索条件
                }

                if ($item_search && $page < 2) {

                    $json['items']['related_keywords'] = json_decode($item_search['related_keywords'], true);
                    $json['items']['crumbs']           = json_decode($item_search['crumbs'], true);
                    $json['items']['breadcrumbs']      = json_decode($item_search['breadcrumbs'], true);
                    $json['items']['nav_catcamp']      = json_decode($item_search['nav_catcamp'], true);
                    $json['items']['navs']             = json_decode($item_search['navs'], true);
                }

            }
        }
        if ($this->client->api_name == 'item_get') {
            $num_iid = ($this->client->api_params['num_iid']);
            $item    = $this->cache_db_dbh->getRow('SELECT * FROM ' . $table_prefix . 'item WHERE rootCatId is NOT NULL and num_iid=?', $num_iid);
            if ($item) {
                foreach ($item as $k => $v) {
                    if (strpos($v, '{') === 0 || strpos($v, '[') === 0) {
                        $item[$k] = json_decode($v, true);
                    }

                }
                $seller = $this->cache_db_dbh->getRow('SELECT * FROM ' . $table_prefix . 'seller WHERE user_num_id=?', $item['seller_id']);
                if (!$seller) {
                    $seller = array();
                }

                foreach ($seller as $k => $v) {
                    if (strpos($v, '{') === 0 || strpos($v, '[') === 0) {
                        $seller[$k] = json_decode($v, true);
                    }

                }
                $item['seller_info'] = $seller;

                $skus                = $this->cache_db_dbh->getRows('SELECT price,orginal_price,properties,properties_name,quantity,sku_id FROM ' . $table_prefix . 'item_sku WHERE num_iid=?', $item['num_iid']);
                $item['skus']['sku'] = $skus;
            }
            //$item=null;
            if ($item) {
                $json = array(
                    'item'             => $item,
                    'secache'          => '',
                    'secache_time'     => '',
                    'secache_date'     => '',
                    'translate_status' => '',
                    'cache'            => '',
                    'api_info'         => '',
                    'execution_time'   => '',
                    'server_time'      => '',
                    'call_args'        => array
                    (
                        'num_iid' => $num_iid,

                    ),
                );
            }

        }
        if(!empty($json)){
           $json['l_cache_from_db']=1;
        }
        $this->client->api_db_data = $json;
        return $json;
    }
    public function cache_to_db()
    {
        $this->init_db_struct();
        $table_prefix = $this->cache_db_config['prefix'] . "obapi_" . $this->client->api_type . '_';

        if ($this->client->api_name == 'item_search') {

            $items = array();

            //!$this->api_data['cache']||
            if ($this->client->api_data['items']['item'][0]['title'] && 1) {
                foreach ($this->client->api_data['items']['item'] as $k => $v) {
                    $item = array(
                        'num_iid'       => $v['num_iid'],
                        'title'         => $v['title'],
                        'price'         => $v['promotion_price'],
                        'orginal_price' => $v['price'],
                        'nick'          => $v['seller_nick'],
                        'pic_url'       => $v['pic_url'],
                        'detail_url'    => $v['detail_url'],
                        'post_fee'      => $v['post_fee'],
                    );
                
                    if (empty($this->client->api_data['items']['cid']) && !empty($this->client->api_params['cat'])) {
                        $this->client->api_data['items']['cid'] = $this->client->api_params['cat'];
                    }

                    if (!empty($this->client->api_data['items']['cid'])) {
                        $item['cid'] = $this->client->api_data['items']['cid'];
                    }

                    $num_iid = $this->cache_db_dbh->getRow('SELECT num_iid FROM ' . $table_prefix . 'item WHERE num_iid=?', $item['num_iid']);

                    if ($num_iid) {
                        $num_iid             = $num_iid['num_iid'];
                        $item['update_time'] = date('Y-m-d H:i:s');
                        $this->cache_db_dbh->updateRows($table_prefix . 'item', $item, 'num_iid=' . $num_iid);
                        //core::updates('item',$item,array('num_iid'=>$item['num_iid']));
                    } else {
                        $items[] = $item;
                    }

                }

            }

            $item_search_keys = array('cat', 'q', 'start_price', 'end_price', 'ppath', 'nick', 'discount', 'locate', 'imgid');
            $item_search_data = array('cat' => '', 'q' => '', 'start_price' => '', 'end_price' => '', 'ppath' => '', 'nick' => '', 'discount' => '', 'locate' => '', 'imgid' => '');
            foreach ($this->client->api_params as $key => $value) {
                if (in_array($key, $item_search_keys)) {
                    $item_search_data[$key] = $value;
                }
            }
// AND q=?

            $item_search_id = $this->cache_db_dbh->getOne('SELECT item_search_id FROM ' . $table_prefix . 'item_search WHERE
					cat=:cat AND q=:q AND start_price=:start_price AND end_price=:end_price AND ppath=:ppath
					AND nick=:nick AND discount=:discount AND locate=:locate AND imgid=:imgid', $item_search_data);

            $item_search_data['real_total_results'] = $this->client->api_data['items']['real_total_results'];
            if(empty($this->client->api_data['items']['related_keywords'])) $this->client->api_data['items']['related_keywords'] = array();
            if(empty($this->client->api_data['items']['crumbs'])) $this->client->api_data['items']['crumbs'] = array();
            if(empty($this->client->api_data['items']['breadcrumbs'])) $this->client->api_data['items']['breadcrumbs'] = array();
            if(empty($this->client->api_data['items']['nav_catcamp'])) $this->client->api_data['items']['nav_catcamp'] = array();
            if(empty($this->client->api_data['items']['navs'])) $this->client->api_data['items']['navs'] = array();
            if(empty($this->client->api_data['items']['url'])) $this->client->api_data['items']['url'] = '';

            $item_search_data['related_keywords']   = json_encode($this->client->api_data['items']['related_keywords']);
            $item_search_data['crumbs']             = json_encode($this->client->api_data['items']['crumbs']);
            $item_search_data['breadcrumbs']        = json_encode($this->client->api_data['items']['breadcrumbs']);
            $item_search_data['nav_catcamp']        = json_encode($this->client->api_data['items']['nav_catcamp']);
            $item_search_data['navs']               = json_encode($this->client->api_data['items']['navs']);
            $item_search_data['url']                = $this->client->api_data['items']['url'];

            if ($item_search_id) {

                $item_search_data['update_time'] = date('Y-m-d H:i:s');
                $this->cache_db_dbh->updateRows($table_prefix . 'item_search', $item_search_data, 'item_search_id=' . $item_search_id);
            } else {
                $status = $this->cache_db_dbh->insertRow($table_prefix . 'item_search', $item_search_data);
            }

            if ($items) {
                //core::inserts('item',array_keys($items[0]),$items);

                $status = $this->cache_db_dbh->insertRows($table_prefix . 'item', $items);

            }

        }
        if ($this->client->api_name == 'item_get') {
            $item_key = array(
                'num_iid', 'title', 'desc_short', 'price', 'orginal_price', 'nick', 'num', 'pic_url', 'brand', 'brandId',
                'rootCatId', 'cid', 'crumbs', 'detail_url', 'desc', 'item_imgs',
                //'type', 'seller_cids',
                'item_weight', 'item_size',
                //'input_pids', 'input_str',  'valid_thru', 'delist_time', 'stuff_status',
                'location', 'post_fee', 'express_fee', 'ems_fee', 'shipping_to', 'has_discount',
                //'freight_payer', 'has_invoice', 'has_warranty', 'has_showcase', 'increment', 'approve_status', 'postage_id', 'product_id', 'auction_point',
                //'item_img', 'prop_img',     'sku','outer_id',
                'video', 'is_virtual', 'sample_id', 'is_promotion', 'props_img',
                'property_alias', 'props', 'props_name', 'total_sold', 'skus', 'seller_id', 'shop_id', 'props_list',
                'seller_info', 'tmall');

            $seller_key = array('user_num_id',
                'sid',
                'title',
                'nick',
                'city',
                'level',
                'bail',
                'rate',
                'score',
                'delivery_score',
                'item_score',
                'shop_type',
                'zhuy',
                'company_name',
                'menu');

            $sku_key = array('sku_id', 'num_iid', 'price', 'orginal_price', 'quantity', 'properties', 'properties_name');

            $json = $this->client->api_data; //&&!$json['cache']

            if ($json['item']['title']) {
                $item = array();
                foreach ($item_key as $key) {

                    $item[$key] = is_array($json['item'][$key]) ? json_encode($json['item'][$key]) : $json['item'][$key];
                    if ($key == 'seller_info') {
                        $item['seller_id'] = $json['item'][$key]['user_num_id'];
                    }

                }

                $seller = array();
                foreach ($seller_key as $key) {
                    $seller[$key] = is_array($json['item']['seller_info'][$key]) ? json_encode($json['item']['seller_info'][$key]) : trim($json['item']['seller_info'][$key]);
                }
                $skus = array();
                if ($json['item']['skus']['sku']) {
                    foreach ($json['item']['skus']['sku'] as $v) {
                        $sku = array();
                        foreach ($sku_key as $key) {

                            $sku[$key] = $v[$key];
                        }
                        $sku['num_iid'] = $item['num_iid'];
                        $skus[]         = $sku;

                    }
                }

                //$num_iid = core::selects('num_iid','item',array('num_iid'=>$item['num_iid']),null,array('column'=>0));
                $num_iid = $this->cache_db_dbh->getRow('SELECT num_iid FROM ' . $table_prefix . 'item WHERE num_iid=?', $item['num_iid']);

                if ($num_iid) {
                    $num_iid             = $num_iid['num_iid'];
                    $item['update_time'] = date('Y-m-d H:i:s');
                    //core::updates('item',$item,array('num_iid'=>$num_iid));
                    $this->cache_db_dbh->updateRows($table_prefix . 'item', $item, 'num_iid=' . $num_iid);
                } else {
                    $item['update_time'] = date('Y-m-d H:i:s');
                    //core::inserts('item',$item);
                    $status = $this->cache_db_dbh->insertRow($table_prefix . 'item', $item);
                }

                $user_num_id = $this->cache_db_dbh->getRow('SELECT user_num_id FROM ' . $table_prefix . 'seller WHERE user_num_id=?', $seller['user_num_id']);

                if ($user_num_id) {
                    $user_num_id         = $user_num_id['user_num_id'];
                    $item['update_time'] = date('Y-m-d H:i:s');
                    //core::updates('item',$item,array('num_iid'=>$num_iid));
                    $this->cache_db_dbh->updateRows($table_prefix . 'seller', $seller, 'user_num_id=' . $user_num_id);
                } else {
                    $item['update_time'] = date('Y-m-d H:i:s');
                    //core::inserts('item',$item);
                    $status = $this->cache_db_dbh->insertRow($table_prefix . 'seller', $seller);
                }
                //core::replaces('item',$item);
                //core::replaces('seller',$seller);

                foreach ($skus as $sku) {
                    $sku_id = $this->cache_db_dbh->getRow('SELECT sku_id FROM ' . $table_prefix . 'item_sku WHERE sku_id=?', $sku['sku_id']);
                    if ($sku_id) {
                        $sku_id             = $sku_id['sku_id'];
                        $sku['update_time'] = date('Y-m-d H:i:s');
                        //core::updates('item',$item,array('num_iid'=>$num_iid));
                        $this->cache_db_dbh->updateRows($table_prefix . 'item_sku', $sku, 'sku_id=' . $sku_id);
                    } else {
                        $sku['update_time'] = date('Y-m-d H:i:s');
                        //core::inserts('item',$item);
                        $status = $this->cache_db_dbh->insertRow($table_prefix . 'item_sku', $sku);
                    }
                }

            } elseif ($json['item']['error']) {
                if ($json['item']['error'] == 'item-not-found') { //下架
                    //$num_iid = core::selects('num_iid','item',array('num_iid'=>$json['call_args'][0]),null,array('column'=>0));
                    $num_iid = $this->cache_db_dbh->getRow('SELECT num_iid FROM ' . $table_prefix . 'item WHERE num_iid=?', $json['call_args'][0]);

                    if ($num_iid) {
                        $item                = array('error' => $json['item']['error']);
                        $item['update_time'] = date('Y-m-d H:i:s');

                        $this->cache_db_dbh->updateRows($table_prefix . 'item', $item, 'num_iid=' . $num_iid);
                        $this->cache_db_dbh->updateRows($table_prefix . 'item', array('rootCatId' => 0), 'rootCatId is null and num_iid=' . $num_iid);
                        //core::updates('item',$item,array('num_iid'=>$num_iid));
                        //core::updates('item',array('rootCatId'=>0),array('num_iid'=>$num_iid,'rootCatId is null'));
                    }
                }

            }
        }

    }

    /**
     * 缓存器
     */
    public function secache()
    {
        if (!$this->secache) {
            $this->secache = array();
        }

        $idk = '';
        if ($this->client->api_type == 'taobao') {
            if ($this->client->api_name == 'get_taobao_item') {
                $idk = $this->client->call_args['num_iid'] % 10;

            }
            if ($this->client->api_name == 'taobao_item_search') {
                if (!empty($this->client->call_args['cat'])) {
                    $idk = '_cat' . ($this->client->call_args['cat'] % 10);
                }

                if (!empty($this->client->call_args['q'])) {
                    $idk .= '_q';
                }
                if (!empty($this->client->call_args['ppath'])) {
                    $idk .= '_p';
                }
                if (!empty($this->client->call_args['page']) && $this->client->call_args['page'] > 1) {
                    $idk .= '_m'; //多页
                }
                $idk = trim($idk, '_');

            }
        }
        if (strlen($idk) > 0) {
            $idk .= '_';
        }

        $k    = $this->client->api_name . '_' . $idk . $this->client->lang;
        $path = null;
        if (empty($this->secache[$k])) {
            if (SECACHE_SIZE == 0) {
                $this->secache[$k] = new secache_no();
            } else {
                $this->secache[$k]  = new secache();
                $this->secache_path = $this->client->secache_path;
                // $this->secache_path = realpath($this->secache_path);
                $path               = $this->secache_path . DS . $this->client->api_type;

                if (!is_dir($path)) {
                    mkdir($path, 0777, true);
                }

            }
            $file               = $path . '/' . $k;
            $this->secache_file = $file;
            $this->secache[$k]->workat($file);
        }
        return $this->secache[$k];
    }

    /**
     * 清理缓存
     */
    public function secache_clear($file = null)
    {
        if ($file) {
            $file = str_replace('..', '', $file);
            $file = str_replace('/', '', $file);
            $file = str_replace('\\', '', $file);
            $file = str_replace(':', '', $file);
            if (file_exists($this->secache_path . $file)) {
                unlink($this->secache_path . $file);
            }

        } else {
            $list = glob($this->secache_path . '*.php');
            foreach ($list as $k => $v) {
                unlink($v);
            }

        }

    }
    /**
     * 缓存列表
     */
    public function secache_list()
    {

        $list = glob($this->secache_path . '*.php');
        foreach ($list as $k => $v) {
            $list[$k] = str_replace($this->secache_path, '', $v);
        }

        return $list;

    }
}
