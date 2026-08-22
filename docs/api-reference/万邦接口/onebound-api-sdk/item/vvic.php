<?php
class item_vvic extends item_base
{

	//url识别处理
	public function parse_url($url)
	{
		$result=array(
			'type'=>null,
			'id'=>null,
			'error'=>null,
			);

	
		if (strpos($url,'vvic.')!==false){
				//https://www.vvic.com/item/14386725
				preg_match('@vvic\.([^/]+)/item/(\d+)@is', $url, $match);
				$result['id']=$match[2];
				$result['type']='vvic';
			}
		return $result;

	}
}
