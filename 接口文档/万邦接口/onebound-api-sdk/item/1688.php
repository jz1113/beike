<?php
class item_1688 extends item_base
{
    public function big2small_pic($url, $width, $height = 0)
    {
        $url = self::small2big_pic($url);
        if (!$height) {
            $height = $width;
        }

        $url = str_replace('.jpg', '.' . $width . 'x' . $height . '.jpg', $url);
        return $url;
    }

    public function bigpic($url)
    {
        $url = str_replace('0q90.jpg', '0.jpg', $url);
        $url = str_replace('xz.jpg', '.jpg', $url);
        $url = preg_replace('@_\d+x\d+.jpg@isU', '', $url);
        $url = preg_replace('@.\d+x\d+.jpg@isU', '.jpg', $url);
        return $url;
    }

}
