<?php
class item_dangdang extends item_base
{

    public function big2small_pic($url, $width, $height = 0)
    {
        if (!$height) {
            $height = $width;
        }

        // http://img3x8.ddimg.cn/15/1/1022181648-2_u_8.jpg(800px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_o_8.jpg(800px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_e_8.jpg(500px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_k_8.jpg(400px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_w_8.jpg(350px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_h_8.jpg(300px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_b_8.jpg(200px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_l_8.jpg(150px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_f_8.jpg(120px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_m_8.jpg(120px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_a_8.jpg(100px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_s_8.jpg(100px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_p_8.jpg(90px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_t_8.jpg(70px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_x_8.jpg(54px)
        // http://img3x8.ddimg.cn/15/1/1022181648-2_v_8.jpg(45px)

        $size = 'k';
        switch ($width) {
            case $width > 500:$size = 'u';
                break;
            case $width > 400:$size = 'e';
                break;
            case $width > 350:$size = 'k';
                break;
            case $width > 300:$size = 'w';
                break;
            case $width > 200:$size = 'h';
                break;
            case $width > 150:$size = 'b';
                break;
            case $width > 120:$size = 'l';
                break;
            case $width > 100:$size = 'm';
                break;
            case $width > 90:$size = 's';
                break;
            case $width > 70:$size = 'p';
                break;
            case $width > 54:$size = 't';
                break;
            case $width > 45:$size = 'x';
                break;
            default:$size = 'v';
        }
        $url = preg_replace('@_(\w)_@isU', '_' . $size . '_', $url);
        return $url;

    }

}
