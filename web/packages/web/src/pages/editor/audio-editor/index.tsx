import { useRef, useState, useEffect, useCallback } from 'react';
import { Button, Slider, Modal, Input, Space, Tag, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseOutlined,
  ScissorOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  RedoOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import styles from './styles.module.css';

interface Region {
  id: string;
  start: number;
  end: number;
  color: string;
}

export const Component = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playingRegionIdRef = useRef<string | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(50);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playingRegionId, setPlayingRegionId] = useState<string | null>(null);

  // 初始化 WaveSurfer
  const initWaveSurfer = useCallback(() => {
    if (!waveformRef.current) {
      console.error('Waveform container not ready');
      return null;
    }

    try {
      // 销毁现有实例
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      // 创建 regions 插件
      const regionsPlugin = RegionsPlugin.create();
      regionsPluginRef.current = regionsPlugin;

      // 创建 WaveSurfer 实例
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4a9eff',
        progressColor: '#1890ff',
        cursorColor: '#ff4d4f',
        barWidth: 2,
        barRadius: 3,
        cursorWidth: 2,
        height: 128,
        barGap: 2,
        plugins: [regionsPlugin],
      });

      wavesurferRef.current = wavesurfer;

      // 监听播放状态
      wavesurfer.on('play', () => setIsPlaying(true));
      wavesurfer.on('pause', () => {
        setIsPlaying(false);
        playingRegionIdRef.current = null;
        setPlayingRegionId(null); // 清除选区播放状态
      });
      wavesurfer.on('finish', () => {
        setIsPlaying(false);
        playingRegionIdRef.current = null;
        setPlayingRegionId(null); // 清除选区播放状态
      });

      // 监听时间更新
      wavesurfer.on('timeupdate', (time: number) => {
        setCurrentTime(time);
        
        // 如果正在播放选区，检查是否到达选区结束
        const currentPlayingRegionId = playingRegionIdRef.current;
        if (currentPlayingRegionId && regionsPluginRef.current) {
          const regions = regionsPluginRef.current.getRegions();
          const region = regions.find((r: any) => r.id === currentPlayingRegionId);
          if (region && time >= region.end) {
            // 到达选区结束，停止播放
            console.log('选区播放结束，停止播放，时间:', time, '选区结束:', region.end);
            wavesurfer.pause();
            wavesurfer.seekTo(region.start / wavesurfer.getDuration());
            playingRegionIdRef.current = null;
            setPlayingRegionId(null);
          }
        }
      });

      // 监听加载完成
      wavesurfer.on('ready', () => {
        console.log('WaveSurfer ready!');
        setDuration(wavesurfer.getDuration());
        setLoading(false);
      });

      // 监听加载错误
      wavesurfer.on('error', (error: any) => {
        console.error('WaveSurfer error:', error);
        window.$message?.error('音频加载失败');
        setLoading(false);
      });

      // 监听 region 创建
      regionsPlugin.on('region-created', (region: any) => {
        setRegions((prev) => [
          ...prev,
          {
            id: region.id,
            start: region.start,
            end: region.end,
            color: region.color,
          },
        ]);

        // 监听 region 播放事件
        region.on('play', () => {
          playingRegionIdRef.current = region.id;
          setPlayingRegionId(region.id);
        });
        
        // 监听 region 播放结束事件（备用方案）
        region.on('out', () => {
          if (wavesurferRef.current && playingRegionIdRef.current === region.id) {
            wavesurferRef.current.pause();
            wavesurferRef.current.seekTo(region.start / wavesurferRef.current.getDuration());
            playingRegionIdRef.current = null;
            setPlayingRegionId(null);
          }
        });
      });

      // 监听 region 更新
      regionsPlugin.on('region-updated', (region: any) => {
        setRegions((prev) =>
          prev.map((r) =>
            r.id === region.id
              ? { ...r, start: region.start, end: region.end }
              : r
          )
        );
      });

      // 监听 region 删除
      regionsPlugin.on('region-removed', (region: any) => {
        setRegions((prev) => prev.filter((r) => r.id !== region.id));
      });

      console.log('WaveSurfer initialized successfully');
      return wavesurfer;
    } catch (error) {
      console.error('Failed to initialize WaveSurfer:', error);
      window.$message?.error('初始化音频编辑器失败');
      setLoading(false);
      return null;
    }
  }, []);

  // 处理文件上传
  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.startsWith('audio/')) {
      window.$message?.error('请上传音频文件！');
      return;
    }

    setLoading(true);
    setAudioFile(file);
    // 实际的加载逻辑在 useEffect 中处理
  }, []);

  // 文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // 拖拽上传
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // 播放/暂停
  const togglePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  // 音量调节
  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(value / 100);
    }
  };

  // 播放速度调节
  const handlePlaybackRateChange = (value: number) => {
    setPlaybackRate(value);
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(value);
    }
  };

  // 缩放调节
  const handleZoomChange = (value: number) => {
    setZoom(value);
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(value);
    }
  };

  // 添加选区（用于剪切）
  const addRegion = () => {
    if (!regionsPluginRef.current || !wavesurferRef.current) {
      window.$message?.warning('请先加载音频文件！');
      return;
    }

    const duration = wavesurferRef.current.getDuration();
    const start = currentTime;
    const end = Math.min(start + 5, duration);

    regionsPluginRef.current.addRegion({
      start,
      end,
      color: 'rgba(24, 144, 255, 0.3)',
      drag: true,
      resize: true,
    });

    window.$message?.success('已添加选区，可拖动调整范围');
  };

  // 删除选区
  const deleteRegion = (regionId: string) => {
    if (regionsPluginRef.current) {
      const regions = regionsPluginRef.current.getRegions();
      const region = regions.find((r: any) => r.id === regionId);
      if (region) {
        region.remove();
      }
    }
  };

  // 播放选区
  const playRegion = (regionId: string) => {
    if (regionsPluginRef.current && wavesurferRef.current) {
      const regions = regionsPluginRef.current.getRegions();
      const region = regions.find((r: any) => r.id === regionId);
      if (region) {
        // 设置当前播放的选区ID（同时更新 ref 和 state）
        playingRegionIdRef.current = regionId;
        setPlayingRegionId(regionId);
        
        // 先跳转到选区开始位置
        wavesurferRef.current.seekTo(region.start / wavesurferRef.current.getDuration());
        
        // 播放选区
        region.play();
      }
    }
  };

  // 剪切音频（导出选区）
  const cutRegion = async (regionId: string) => {
    const region = regions.find((r) => r.id === regionId);
    if (!region || !audioBuffer) {
      window.$message?.error('无法剪切音频');
      return;
    }

    try {
      const audioContext = new AudioContext();
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(region.start * sampleRate);
      const endSample = Math.floor(region.end * sampleRate);
      const length = endSample - startSample;

      // 创建新的 AudioBuffer
      const newBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        length,
        sampleRate
      );

      // 复制选区的音频数据
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const targetData = newBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          targetData[i] = sourceData[startSample + i];
        }
      }

      // 导出为 MP3（默认）
      try {
        await exportAudioBufferAsMP3(newBuffer, `cut_${Date.now()}.mp3`);
        window.$message?.success('音频片段已导出为 MP3！');
      } catch (error) {
        window.$message?.warning('MP3 导出失败，已回退到 WAV 格式');
      }
    } catch (error) {
      console.error('剪切失败:', error);
      window.$message?.error('剪切失败，请重试！');
    }
  };

  // 导出 AudioBuffer 为 MP3
  const exportAudioBufferAsMP3 = async (buffer: AudioBuffer, filename: string) => {
    try {
      // 动态导入 lamejs
      // @ts-expect-error: lamejs 无官方类型声明，运行时通过动态导入使用
      const lamejs = await import('lamejs');
      
      // 获取 Mp3Encoder
      let Mp3Encoder: any;
      if (lamejs.default && lamejs.default.Mp3Encoder) {
        Mp3Encoder = lamejs.default.Mp3Encoder;
      } else if (lamejs.Mp3Encoder) {
        Mp3Encoder = lamejs.Mp3Encoder;
      } else {
        Mp3Encoder = lamejs;
      }

      if (typeof Mp3Encoder !== 'function') {
        throw new Error('无法找到 Mp3Encoder');
      }

      const mp3encoder = new Mp3Encoder(
        buffer.numberOfChannels,
        buffer.sampleRate,
        128 // 比特率 128kbps
      );

      const sampleBlockSize = 1152;
      const samples: Uint8Array[] = [];
      
      // 获取音频数据
      const leftChannel = buffer.getChannelData(0);
      const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel;

      // 将浮点样本转换为 16 位整数
      const convertTo16BitPCM = (input: Float32Array): Int16Array => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return output;
      };

      const leftData = convertTo16BitPCM(leftChannel);
      const rightData = convertTo16BitPCM(rightChannel);

      // 编码 MP3
      for (let i = 0; i < leftData.length; i += sampleBlockSize) {
        const leftChunk = leftData.subarray(i, Math.min(i + sampleBlockSize, leftData.length));
        const rightChunk = rightData.subarray(i, Math.min(i + sampleBlockSize, rightData.length));
        
        // 如果最后一个块不够 1152 个样本，需要填充
        if (leftChunk.length < sampleBlockSize) {
          const paddedLeft = new Int16Array(sampleBlockSize);
          const paddedRight = new Int16Array(sampleBlockSize);
          paddedLeft.set(leftChunk);
          paddedRight.set(rightChunk);
          const mp3buf = mp3encoder.encodeBuffer(paddedLeft, paddedRight);
          if (mp3buf.length > 0) {
            samples.push(mp3buf);
          }
        } else {
          const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
          if (mp3buf.length > 0) {
            samples.push(mp3buf);
          }
        }
      }

      // 完成编码
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        samples.push(mp3buf);
      }

      if (samples.length === 0) {
        throw new Error('MP3 编码未产生任何数据');
      }

      // 合并所有 MP3 数据块
      const totalLength = samples.reduce((sum, arr) => sum + arr.length, 0);
      const mergedArray = new Uint8Array(totalLength);
      let offset = 0;
      for (const sample of samples) {
        mergedArray.set(sample, offset);
        offset += sample.length;
      }

      const mp3Blob = new Blob([mergedArray], { type: 'audio/mpeg' });
      
      // 下载文件
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('MP3 编码失败，回退到 WAV:', error);
      // 回退到 WAV
      await exportAudioBuffer(buffer, filename.replace('.mp3', '.wav'));
      throw error;
    }
  };

  // 导出完整音频（默认 MP3）
  const exportAudio = async () => {
    if (!audioBuffer) {
      window.$message?.warning('请先加载音频文件！');
      return;
    }

    try {
      await exportAudioBufferAsMP3(audioBuffer, `edited_${Date.now()}.mp3`);
      window.$message?.success('音频已导出为 MP3！');
    } catch (error) {
      window.$message?.warning('MP3 导出失败，已回退到 WAV 格式');
    }
  };

  // 导出 AudioBuffer 为 WAV
  const exportAudioBuffer = async (buffer: AudioBuffer, filename: string) => {
    const numberOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // WAV 文件头
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // 写入音频数据
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    // 下载文件
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // 当音频文件改变时初始化并加载
  useEffect(() => {
    if (!audioFile) return;

    const loadAudio = async () => {
      try {
        // 如果已有实例，先销毁
        if (wavesurferRef.current) {
          wavesurferRef.current.destroy();
          wavesurferRef.current = null;
        }

        console.log('Initializing WaveSurfer...');
        const wavesurfer = initWaveSurfer();
        if (!wavesurfer) {
          throw new Error('无法初始化音频编辑器，请刷新页面重试');
        }

        console.log('Loading audio file...');
        await wavesurfer.loadBlob(audioFile);
        
        // 加载音频到 AudioBuffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        setAudioBuffer(buffer);
        
        window.$message?.success('音频加载成功！');
      } catch (error) {
        console.error('音频加载失败:', error);
        window.$message?.error('音频加载失败，请重试！' + (error instanceof Error ? ': ' + error.message : ''));
        setLoading(false);
      }
    };

    loadAudio();
  }, [audioFile, initWaveSurfer]);


  // 清理
  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎵 音频编辑器</h1>
        <p className={styles.description}>
          支持音频上传、剪切、调速、调音量等功能，可导出编辑后的音频
        </p>
      </div>

      {!audioFile ? (
        <div
          className={styles.uploadArea}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className={styles.uploadIcon}>
            <CloudUploadOutlined />
          </div>
          <div className={styles.uploadText}>点击或拖拽上传音频文件</div>
          <div className={styles.uploadHint}>
            支持 MP3、WAV、OGG、M4A 等格式
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      ) : (
        <div className={styles.editorArea}>
          {/* 工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarGroup}>
              <Tooltip title="播放/暂停">
                <Button
                  type="primary"
                  icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />}
                  onClick={togglePlayPause}
                  size="large"
                >
                  {isPlaying ? '暂停' : '播放'}
                </Button>
              </Tooltip>
            </div>

            <div className={styles.toolbarGroup}>
              <Tooltip title="添加选区">
                <Button icon={<ScissorOutlined />} onClick={addRegion}>
                  添加选区
                </Button>
              </Tooltip>
            </div>

            <div className={styles.toolbarGroup}>
              <Tooltip title="导出音频">
                <Button icon={<DownloadOutlined />} onClick={exportAudio} type="default">
                  导出
                </Button>
              </Tooltip>
              <Tooltip title="重新上传">
                <Button
                  icon={<CloudUploadOutlined />}
                  onClick={() => {
                    setAudioFile(null);
                    setRegions([]);
                    if (wavesurferRef.current) {
                      wavesurferRef.current.destroy();
                      wavesurferRef.current = null;
                    }
                  }}
                >
                  重新上传
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* 时间信息 */}
          <div style={{ marginBottom: 16 }}>
            <Space>
              <div className={styles.timeInfo}>
                <span className={styles.timeLabel}>当前:</span>
                <span className={styles.timeValue}>{formatTime(currentTime)}</span>
              </div>
              <div className={styles.timeInfo}>
                <span className={styles.timeLabel}>总长:</span>
                <span className={styles.timeValue}>{formatTime(duration)}</span>
              </div>
            </Space>
          </div>

          {/* 波形显示 */}
          <div className={styles.waveformContainer}>
            {loading && <div className={styles.loading}>加载中...</div>}
            <div ref={waveformRef} className={styles.waveform} />
          </div>

          {/* 控制面板 */}
          <div className={styles.settingsPanel}>
            <div className={styles.settingItem}>
              <label className={styles.settingLabel}>
                <SoundOutlined /> 音量: {volume}%
              </label>
              <Slider
                min={0}
                max={100}
                value={volume}
                onChange={handleVolumeChange}
                className={styles.slider}
              />
            </div>

            <div className={styles.settingItem}>
              <label className={styles.settingLabel}>
                <ThunderboltOutlined /> 速度: {playbackRate.toFixed(2)}x
              </label>
              <Slider
                min={0.25}
                max={2}
                step={0.25}
                value={playbackRate}
                onChange={handlePlaybackRateChange}
                marks={{
                  0.25: '0.25x',
                  0.5: '0.5x',
                  1: '1x',
                  1.5: '1.5x',
                  2: '2x',
                }}
                className={styles.slider}
              />
            </div>

            <div className={styles.settingItem}>
              <label className={styles.settingLabel}>
                <ZoomInOutlined /> 缩放: {zoom}
              </label>
              <Slider
                min={1}
                max={200}
                value={zoom}
                onChange={handleZoomChange}
                className={styles.slider}
              />
            </div>
          </div>

          {/* 选区列表 */}
          {regions.length > 0 && (
            <div className={styles.regionList}>
              <div className={styles.regionListTitle}>选区列表</div>
              {regions.map((region) => (
                <div key={region.id} className={styles.regionItem}>
                  <div className={styles.regionInfo}>
                    <span className={styles.regionName}>选区</span>
                    <span className={styles.regionTime}>
                      {formatTime(region.start)} - {formatTime(region.end)}
                    </span>
                    <Tag color="blue">
                      {formatTime(region.end - region.start)}
                    </Tag>
                  </div>
                  <div className={styles.regionActions}>
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() => playRegion(region.id)}
                    >
                      播放
                    </Button>
                    <Button
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={() => cutRegion(region.id)}
                    >
                      导出
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteRegion(region.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {regions.length === 0 && audioFile && (
            <div className={styles.emptyState}>
              点击&quot;添加选区&quot;按钮来标记需要剪切的音频片段
            </div>
          )}
        </div>
      )}
    </div>
  );
};
