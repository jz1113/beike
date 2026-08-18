<?php
if (!function_exists('getmicrotime')) {
function getmicrotime() {
    list($usec, $sec) = explode(" ",microtime());
    return ((float)$usec + (float)$sec);
} 
}
if (!function_exists('get_use_time')) {
function get_use_time($min=false,$reset=false) {
    global $time_start;
	static $time_start2;
	if(!$time_start2)$time_start2=$time_start;
    $time_end = getmicrotime();
    $times = $time_end - ($reset?$time_start2:$time_start);
    $times = sprintf('%.5f',$times);
    if($min==false) {
        $use_time =  "用时:". $times ."秒";
    }else {
        $use_time = $times;
    }
	$time_start2 = $time_end;
	
    return $use_time;
}

}

