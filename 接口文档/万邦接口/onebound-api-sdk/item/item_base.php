<?php
class item_base
{

    /**
     * 大图或最大规格图片切换为指定规格的图片
     */
    public function big2small_pic($url, $width, $height = 0)
    {
        if (!$height) {
            $height = $width;
        }

        return $url;
    }

    /**
     * 未经处理的图片url切换为最大规格的url
     */
    public function small2big_pic($url)
    {
        // if (!$height) {
        //     $height = $width;
        // }

        return $url;
    }

    /**
     * 将数据中价格部分转换为本系统默认货币
     * @$api_name string api接口名称
     * @$data array 数据
     * @$value float 与默认货币的汇率差
     */
    public function convert($api_name, $data, $value)
    {
        if ($api_name == 'item_get') {
            $this->convert_item_get($data, $value);
        }
        return $data;

    }

    public function convert_value(&$array, $key, $value)
    {
        if (is_array($key)) {
            foreach ($key as $k) {
                $this->convert_value($array, $k, $value);
            }

        } else {

            $array[$key . '_api_old'] = $array[$key]; //记录api原来的价格
            if (strpos($array[$key], '-') !== false) {
                list($p1, $p2) = explode('-', $array[$key]);
                $p1            = (float) $p1;
                $p2            = (float) $p2;

                $array[$key] = ($p1 / $value) . '-' . ($p2 / $value);
            } else {
                $array[$key] = $array[$key] ? $array[$key] / $value : 0;
            }
        }

    }

    public function convert_item_get(&$data, $value)
    {
        $this->convert_value($data['item'], array('price', 'orginal_price', 'total_price', 'suggestive_price', 'post_fee', 'express_fee'), $value);
        if (is_array($data['item']['skus']['sku'])) {
            foreach ($data['item']['skus']['sku'] as $k => $v) {
                $this->convert_value($data['item']['skus']['sku'][$k], array('price', 'orginal_price'), $value);
            }

        }

        if (is_array($data['item']['priceRange'])) {
            foreach ($data['item']['priceRange'] as $k => $v) {
                $this->convert_value($data['item']['priceRange'][$k], 1, $value);
            }

        }

    }
	/**
	* 短网址检测和处理
	*/
	public function short_url($url)
	{
		return $url;
	}
	/**
	* 根据URL判断网站类型和获取 idS
	*/
	public function parse_url($url)
	{
		$result=array(
			'type'=>null,
			'id'=>null,
			'error'=>null,
			);

		return $result;


	}
}