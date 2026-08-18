<?php 
class item_lazada extends item_base{
	public function big2small_pic($url,$width,$height=0){
		$url = self::small2big_pic($url);
		if(!$height)$height=$width;
 
		//https://my-test-11.slatic.net/p/6/10pcs-5g10cm-soft-lure-t-tail-soft-baits-artificial-blackfish-striped-bass-fishing-gear-tackles-tools-1039-736205151-1479c3683288510d09a0e8c6aa14eea2-catalog.jpg_80x80Q100.jpg
		$url = str_replace('.jpg','.jpg_'.$width.'x'.$height.'Q100.jpg',$url);
		return $url;
	}

	public function small2big_pic($url){

		//https://my-test-11.slatic.net/p/8/mini-focus-top-luxury-brand-watch-famous-fashion-sports-cool-menquartz-watches-waterproof-leather-wristwatch-for-male-mf0058g-1387-02783358-a8f1cf11c54e1d1adfa32000e5ff4444.jpg
		//https://my-test-11.slatic.net/p/8/mini-focus-top-luxury-brand-watch-famous-fashion-sports-cool-menquartz-watches-waterproof-leather-wristwatch-for-male-mf0058g-1387-02783358-a8f1cf11c54e1d1adfa32000e5ff4444-catalog_233.jpg
		//https://my-test-11.slatic.net/p/8/mini-focus-top-luxury-brand-watch-famous-fashion-sports-cool-menquartz-watches-waterproof-leather-wristwatch-for-male-mf0058g-1387-02783358-a8f1cf11c54e1d1adfa32000e5ff4444-gallery.jpg
		
		//https://my-test-11.slatic.net/p/6/10pcs-5g10cm-soft-lure-t-tail-soft-baits-artificial-blackfish-striped-bass-fishing-gear-tackles-tools-1039-736205151-1479c3683288510d09a0e8c6aa14eea2-catalog.jpg_80x80Q100.jpg

		$url = str_replace('_sum.jpg','',$url);
		$url = str_replace('0q90.jpg','0.jpg',$url);
		$url = preg_replace('@_\d+x\d+.jpg@isU','',$url);
		$url = preg_replace('@_\d+x\d+Q\d+.jpg@isU','',$url);

		$url = str_replace('-catalog_233.jpg','.jpg',$url);
		$url = str_replace('-gallery.jpg','.jpg',$url);
		return $url;
	}

}
