// 布局偏好在各项目间共享；节点、连线和素材仍随项目保存。
const controls: Record<string, string> = {
  'actions.confirmDelete': 'confirm_canvas_delete',
  'connections.half': 'connection_full_display', 'connections.tilt': 'enable_connect_wire_tilt',
  'connections.marquee': 'enable_connect_wire_marquee', 'connections.flow': 'enable_generation_connection_flow',
  'connections.darkColor': 'connection_line_color_dark', 'connections.lightColor': 'connection_line_color_light',
  'connections.width': 'connection_line_stroke_width', 'connections.hit': 'connection_hit_width',
  'connections.alpha': 'connection_line_opacity_percent', 'board.follow': 'follow_downstream_on_drag',
  'board.grid': 'show_canvas_grid', 'board.gap': 'canvas_grid_spacing', 'board.dot': 'canvas_grid_dot_size',
  'board.snap': 'show_canvas_snap', 'board.guides': 'show_alignment_guides', 'board.minimap': 'show_canvas_minimap',
  'board.glow': 'show_canvas_bg_glow', 'board.motion': 'locate_animation_max_nodes',
  'nodes.close': 'show_node_delete_button', 'nodes.start': 'show_start_generate_button',
  'nodes.timer': 'show_canvas_generation_timer', 'nodes.hidePreview': 'hide_all_input_image_previews',
  'nodes.motion': 'enable_generation_node_animation',
};
export const studioPreferencePrefix = 'beike.studio.preferences.';
export const studioPreferenceKeys = Object.fromEntries(Object.entries(controls).map(([id, suffix]) => [id, 'qiaodoumayi_' + suffix]));
// These renderer preferences are workspace-wide; per-project values remain a read fallback.
export const studioSharedPreferenceKeys = [
  ...Object.values(studioPreferenceKeys),
  'qiaodoumayi_studio_sidebar_theme',
  'qiaodoumayi_left_toolbar_dock',
  'qiaodoumayi_left_toolbar_collapsed',
  'qiaodoumayi_left_toolbar_sidebar_pins',
  'qiaodoumayi_left_toolbar_overflow_order',
];
