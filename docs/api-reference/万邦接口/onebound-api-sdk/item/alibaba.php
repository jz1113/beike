<?php
class item_alibaba extends item_base
{
    public function big2small_pic($url, $width, $height = 0)
    {
        $url = self::small2big_pic($url);
        if (!$height) {
            $height = $width;
        }

        return $url;
    }

    public function bigpic($url)
    {

        return $url;
    }

}
