<?php
namespace otao;

class secache_no
{
    public function workat($file)
    {
    }
    public function fetch($key, &$return)
    {
    }
    public function store($key, $value)
    {
    }
    public function status(&$curBytes, &$totalBytes)
    {
        $totalBytes = $curBytes = 0;
        $hits       = $miss       = 0;
        $return[]   = array('name' => '缓存命中', 'value' => $hits);
        $return[]   = array('name' => '缓存未命中', 'value' => $miss);
        return $return;
    }

}