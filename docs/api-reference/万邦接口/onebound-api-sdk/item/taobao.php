<?php
class item_taobao extends item_base
{
    //大图转小图
    public function big2small_pic($url, $width, $height = 0, $quality = null)
    {
        $url = self::small2big_pic($url);
        if (!$height) {
            $height = $width;
        }

        $url = $url . '_' . $width . 'x' . $height . ($quality ? 'Q' . $quality : '') . '.jpg';
        return $url;
    }

    //小图转大图
    public function small2big_pic($url)
    {

        $url = str_replace('_sum.jpg', '', $url);
        $url = str_replace('0q90.jpg', '0.jpg', $url);
        $url = preg_replace('@_\d+x\d+.jpg@isU', '', $url);
        return $url;

    }

}
