<?php
/**
 * oTao数据翻译处理API
 */
class translateAPI extends baseTranslateAPI
{

    public $default_lang = 'cn';
    public $lang         = 'cn';
    public $desc_lang    = 'cn';
    public $prop_lang    = 'cn';

    public function item_search_jupage($data)
    {

        $t_array = array();
        foreach ($data['items']['item'] as $k => $v) {
            $t_array[] = $v['title'];
        }

        $t_array_t = $this->translator()->translate_array($t_array);
        if (count($t_array_t) == count($t_array)) {

            foreach ($data['items']['item'] as $k => $v) {
                $data['items']['item'][$k]['title'] = $t_array_t[$k];
            }
        }
        return $data;

    }
}
