<?php
namespace otao;

use PDO;

class ObApiDB extends PDO
{
    private $charset; // 数据库字符集
    public $cacheDir = '_cache/';
    public $prename;

    public $time;

    public function __construct($dsn, $user = '', $password = '')
    {

        try {
            parent::__construct($dsn, $user, $password);
        } catch (Exception $e) {
            throw new Exception('连接数据库失败:' . $e);
        }
        $this->time = intval($_SERVER['REQUEST_TIME']);

        //$this->setCharset($conf['db']['charset']);

    }

    public function setCharset($charset)
    {
        if ($charset && $this->charset != $charset) {
            $this->charset = $charset;
            $this->query('set names ' . $charset);
        }
    }
    public function getRows($sql, $params = null, $expire = 0)
    { //{{{
        if ($expire) {

            return $this->getRows($sql, $params);

        } else {

            $stmt = $this->prepare($sql);
            if (!is_array($params)) {
                // 如果传入的是一个值
                $params = array($params);
            } else if (array_key_exists(0, $params)) {
                // 如果传入的是一个数字索引的数组
                //$stmt=$this->prepare($sql, $params);
            } else {
                // 如果传入的是一个字符索引的数组
                //$para=array();
                //foreach($params as $key=>$val) $para[":$key"]=$val;
                //$params=$para;
            }

            $stmt->execute($params);
            $stmt->setFetchMode(PDO::FETCH_ASSOC);
            $return = $stmt->fetchAll();
            $stmt   = null;
            return $return;

        }
        //}}}
    }

    public function getRow($sql, $params = null, $expire = 0)
    { //{{{
        if ($expire) {
            return $this->getRow($sql, $params);
        } else {

            $stmt = $this->prepare($sql);
            if (!is_array($params)) {
                // 如果传入的是一个值
                $params = array($params);
            } else if (array_key_exists(0, $params)) {
                // 如果传入的是一个数字索引的数组
                //$stmt=$this->prepare($sql, $params);
            } else {
                // 如果传入的是一个字符索引的数组
                //$para=array();
                //foreach($params as $key=>$val) $para[":$key"]=$val;
                //$params=$para;
            }

            if (!$stmt) {
                var_dump($this->errorCode());
                var_dump($this->errorInfo());
                echo self::lastQuery($this, $sql, $params);
                //echo '<pre>';debug_print_backtrace();echo '</pre>';
                //print_r($return);exit;

            }
            // echo '<br>';
            // var_dump($params);echo '<br>';
            //echo $sql.'<br><br><br>';
            //$stmt->execute($params);
            if (!$return = $stmt->execute($params)) {
                $err = $stmt->errorInfo();
                var_dump($err);
                //throw new Exception(end($err));
            }

            $stmt->setFetchMode(PDO::FETCH_ASSOC);
            $return = $stmt->fetch();

            $stmt = null;
            return $return;
        }
        //}}}
    }
    public function getOne($sql, $params = null, $expire = 0)
    { //{{{
        $row = $this->getRow($sql, $params, $expire);
        $one = null;
        if ($row) {
            $one = array_pop($row);
        }
        return $one;
    }
    public function delete($query, $params = null)
    {
        return $this->update($query, $params);
    }

    public function update($query, $params = null)
    {
        return $this->insert($query, $params);
    }

    public function updateRows($table, $data, $where)
    {
        $sql = "update $table set";
        foreach ($data as $key => $_v) {
            $sql .= " `$key`=:$key,";
        }

        $sql = rtrim($sql, ',') . " where $where";

        return $this->update($sql, $data);
    }
    public function insert($query, $params = null)
    {
        // echo $query.'<br>';
        // print_r($params);
        // echo '<br><br>';
        if ($params && !is_array($params)) {
            $params = array($params);
        }

        if ($params) {
            if (!$stmt = $this->prepare($query)) {
                throw new Exception('解析查询语句出错，SQL语句：' . $query);
            }

            if (!$return = $stmt->execute($params)) {
                //debug_print_backtrace();
                $err = $stmt->errorInfo();
                var_dump($query, $err);exit();
                throw new Exception(end($err));
            }
            return $return;
        } else {
            if ($this->exec($query)) {
                return true;
            } else {
                $err = $this->errorInfo();
                var_dump($query, $err);exit();
                throw new Exception(end($err));
            }
        }

    }

    public function insertRow($table, $data)
    {
        $sql    = "insert into $table(";
        $values = '';
        foreach ($data as $key => $val) {
            if ($values) {
                $sql .= ', ';
                $values .= ', ';
            }
            $sql .= "`$key`";
            $values .= ":$key";
        }
        $sql .= ") values($values)";

        return $this->insert($sql, $data);
    }
    public function insertRows($table, $datas)
    {
        $sql = "INSERT INTO  `$table`";

        $values = '';
        $dbdata = array();
        foreach ($datas as $k => $data) {
            if ($values) {
                $values .= ',';
            }

            $values .= '(';
            $v = array();
            foreach ($data as $key => $val) {
                $v[]                     = ":{$k}_{$key}";
                $dbdata[$k . '_' . $key] = $val;
            }
            $values .= implode(',', $v);
            $values .= ')';
        }
        $sql .= '(`' . implode('`,`', array_keys($data)) . '`)';
        $sql .= "values $values";

        return $this->insert($sql, $dbdata);
    }
    public function getTablesInfo($table)
    {	
    	// $result = $this->query('select * from sqlite_master WHERE type = "table"');
     //    while ( $row = $result->fetchArray(SQLITE3_ASSOC) )
     //    {
     //        isset($row['name']) && $this->table_info[] = $row;
     //    }

    	//show full fields from 'api_item_log';
    	$table = $this->getRows("DESC `".$table."`;");

    	$table_info = array();
    	foreach($table as $v){
    		$table_info[$v['Field']]=$v;
    	}
        return $table_info;
    }
}
