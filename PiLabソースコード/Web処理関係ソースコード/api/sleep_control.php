<?php
/**
 * 睡眠レコーダー制御API
 * systemdサービス経由で制御
 */

header('Content-Type: application/json; charset=utf-8');

// 設定
$SERVICE_NAME = 'sleep_recorder';
$STATUS_FILE = '/home/admin/Desktop/pi/sleep/sleep_status.json';

// アクションを取得
$action = isset($_GET['action']) ? $_GET['action'] : '';

/**
 * サービスが実行中かどうか確認
 */
function is_running($service_name)
{
    exec("sudo systemctl is-active {$service_name} 2>&1", $output, $return_var);
    return $return_var === 0;
}

/**
 * サービスを停止
 */
function stop_service($service_name)
{
    exec("sudo systemctl stop {$service_name} 2>&1", $output, $return_var);
    return ['success' => $return_var === 0, 'message' => $return_var === 0 ? '停止しました' : '停止に失敗しました'];
}

/**
 * サービスを開始
 */
function start_service($service_name)
{
    // 既に実行中かチェック
    if (is_running($service_name)) {
        return ['success' => false, 'message' => '既に実行中です'];
    }

    exec("sudo systemctl start {$service_name} 2>&1", $output, $return_var);

    // 起動を待機
    sleep(2);

    if (is_running($service_name)) {
        return ['success' => true, 'message' => '開始しました'];
    } else {
        return ['success' => false, 'message' => '起動に失敗しました'];
    }
}

/**
 * ステータスを取得
 */
function get_status($service_name, $status_file)
{
    $running = is_running($service_name);

    $status = [
        'running' => $running,
        'is_sleeping' => false,
        'start_time' => null,
        'total_sleep_seconds' => 0
    ];

    // ステータスファイルがあれば読み込む
    if (file_exists($status_file)) {
        $json = file_get_contents($status_file);
        $file_status = json_decode($json, true);
        if ($file_status) {
            $status = array_merge($status, $file_status);
            $status['running'] = $running;  // 実際の実行状態で上書き
        }
    }

    return $status;
}

// アクションに応じて処理
switch ($action) {
    case 'start':
        $result = start_service($SERVICE_NAME);
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
        break;

    case 'stop':
        $result = stop_service($SERVICE_NAME);
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
        break;

    case 'status':
        $status = get_status($SERVICE_NAME, $STATUS_FILE);
        echo json_encode($status, JSON_UNESCAPED_UNICODE);
        break;

    default:
        echo json_encode([
            'error' => 'Invalid action',
            'available_actions' => ['start', 'stop', 'status']
        ], JSON_UNESCAPED_UNICODE);
        break;
}
