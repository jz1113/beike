<?php
class item_jd extends item_base
{

    public function big2small_pic($url, $width, $height = 0)
    {
        $url = self::small2big_pic($url);
        if (!$height) {
            $height = $width;
        }

        $url = str_replace('.com/n0/', '.com/n0/s' . $width . 'x' . $height . '_', $url);
        return $url;
    }
    public function bigpic($url)
    {
        //http://img14.360buyimg.com/n9/s60x76_jfs/t7420/95/1468569271/360236/55f80904/599d5d48N722a257b.jpg!cc_60x76.jpg
        $url = preg_replace('@s\d+x\d+_jfs@isU', 'jfs', $url);
        $url = preg_replace('@.com/n\d/@', '.com/n0/', $url);
        $url = preg_replace('@\!cc_\d+x\d+.jpg@', '', $url);

        return $url;
    }

}
