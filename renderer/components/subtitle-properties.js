/* The property panel emits patches; selection ownership stays in SubtitleEditor. */
class SubtitleProperties {
  constructor(host, change, getStyle) {
    this.host=host;this.change=change;this.getStyle=getStyle;this.inputs=new Map();
    host.replaceChildren();host.classList.add('subtitle-properties');
    this.header=document.createElement('h3');this.header.id='sub-editing-state';host.append(this.header);
    const presets=document.createElement('div');presets.className='sub-presets';
    this.presetName=document.createElement('input');this.presetName.placeholder='Nombre del preset';this.presetName.setAttribute('aria-label','Nombre del preset');this.presetName.maxLength=80;
    const save=this.button('Guardar preset',()=>this.savePreset());save.id='sub-save-preset';
    this.presetSelect=document.createElement('select');this.presetSelect.id='sub-load-preset';this.presetSelect.setAttribute('aria-label','Cargar preset');
    this.presetSelect.onchange=()=>{if(this.presetSelect.value==='')return;const p=this.presets[Number(this.presetSelect.value)];if(p)this.change({...p.style});};
    const remove=this.button('Eliminar',()=>this.deletePreset());remove.id='sub-delete-preset';
    presets.append(this.presetName,save,this.presetSelect,remove);host.append(presets);
    this.presets=SubtitleStyleStore.load();this.refreshPresets();
    this.notice=document.createElement('p');this.notice.className='sub-style-notice';this.notice.setAttribute('role','status');host.append(this.notice);
    this.sections=document.createElement('div');this.sections.className='sub-property-sections';host.append(this.sections);
    const text=this.section('TEXTO',true);
    this.select(text,'Fuente','font',SubtitleStyle.fonts);
    this.fontNotice=document.createElement('p');this.fontNotice.className='sub-font-notice';text.append(this.fontNotice);
    this.range(text,'Tamaño','size',40,140,'px');this.color(text,'Color del texto','color');
    this.toggle(text,'B · Negrita','bold');this.toggle(text,'I · Cursiva','italic');this.toggle(text,'AA · Mayúsculas','uppercase');
    this.toggle(text,'Outline · Borde','outlineEnabled');this.color(text,'Color del borde','outlineColor');this.range(text,'Grosor','outlineWidth',0,8,'px');
    this.toggle(text,'Sombra','shadowEnabled');this.color(text,'Color de sombra','shadowColor');this.range(text,'Desenfoque','shadowBlur',0,20,'px');
    this.range(text,'Offset X','shadowOffsetX',-10,10,'px');this.range(text,'Offset Y','shadowOffsetY',-10,10,'px');
    const entry=this.section('ANIMACIÓN DE ENTRADA');this.cards(entry,'animation',SubtitleStyle.entries);
    this.range(entry,'Duración de entrada','entryDuration',100,600,'ms');this.toggle(entry,'Animación de salida','exitEnabled');
    this.cards(entry,'exitAnimation',SubtitleStyle.exits);this.range(entry,'Duración de salida','exitDuration',100,600,'ms');
    const words=this.section('ANIMACIÓN DE PALABRA (karaoke)');this.cards(words,'wordAnimation',SubtitleStyle.words);
    this.color(words,'Color de highlight','highlightColor');this.color(words,'Texto no activo','inactiveColor');
    const pos=this.section('POSICIÓN');
    this.cards(pos,'verticalPosition',['top','center','bottom'],['▲ Top','● Center','▼ Bottom']);this.range(pos,'Margen vertical','marginV',-200,200,'px');
    this.cards(pos,'horizontalPosition',['left','center','right'],['◀ Left','● Center','▶ Right']);this.range(pos,'Margen horizontal','marginH',-300,300,'px');
    const anchorLabel=document.createElement('p');anchorLabel.textContent='Punto de anclaje';pos.append(anchorLabel);
    this.cards(pos,'anchor',[7,8,9,4,5,6,1,2,3],['↖','↑','↗','←','●','→','↙','↓','↘'],'sub-anchor-grid');
    this.range(pos,'Ancho máximo','maxWidth',40,100,'%');
    const bg=this.section('FONDO / CAJA');this.toggle(bg,'Mostrar caja','bgEnabled');this.cards(bg,'bgType',['Per word','Per line','Per block']);
    this.color(bg,'Color de fondo','bgColor');this.range(bg,'Opacidad','bgOpacity',0,100,'%',100);this.range(bg,'Radio','bgRadius',0,20,'px');this.range(bg,'Padding','bgPadding',0,30,'px');
    const preview=document.createElement('div');preview.className='sub-mini-preview';
    this.canvas=document.createElement('canvas');this.canvas.id='sub-preview-canvas';this.canvas.width=240;this.canvas.height=426;this.canvas.setAttribute('aria-label','Vista previa vertical del estilo');
    const caption=document.createElement('div');caption.innerHTML='<strong>Vista previa · 9:16</strong><p>El estilo se actualiza al instante.</p>';
    this.replay=this.button('↻ Repetir',()=>{});this.replay.id='sub-preview-play-btn';caption.append(this.replay);preview.append(this.canvas,caption);host.append(preview);
    this.fonts=[];
    window.electronAPI.subtitleFonts().then(result=>{this.fonts=result.fonts || [];this.fontError=result.error;this.updateFonts();}).catch(e=>{this.fontError=e.message;this.updateFonts();});
  }
  button(label,fn) {const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
  section(title,open=false) {const d=document.createElement('details');d.open=open;const summary=document.createElement('summary');summary.textContent=title;const body=document.createElement('div');body.className='sub-section-body';d.append(summary,body);this.sections.append(d);return body;}
  row(parent,label) {const row=document.createElement('label');row.className='sub-property-row';const title=document.createElement('span');title.textContent=label;row.append(title);parent.append(row);return row;}
  register(key,control,read,write,event='input') {
    control.dataset.style=key;(this.inputs.get(key)||this.inputs.set(key,[]).get(key)).push({control,write});
    control.addEventListener(event,()=>{const value=read();if(value!==undefined)this.change({[key]:value});});
  }
  select(parent,label,key,options) {const row=this.row(parent,label),input=document.createElement('select');for(const option of options)input.add(new Option(option,option));row.append(input);this.register(key,input,()=>input.value,v=>input.value=v,'change');}
  range(parent,label,key,min,max,unit,factor=1) {
    const row=this.row(parent,label),controls=document.createElement('div');controls.className='sub-range-pair';
    for(const type of ['range','number']) {
      const input=document.createElement('input');input.type=type;input.min=min;input.max=max;input.step=1;input.setAttribute('aria-label',label+(type==='number'?' (valor)':''));
      this.register(key,input,()=>input.value!=='' && Number.isFinite(input.valueAsNumber) ? SubtitleStyle.clamp(input.valueAsNumber,min,max)/factor : undefined,v=>input.value=Math.round(v*factor));
      input.addEventListener('change',()=>{if(input.value==='')this.sync(this.getStyle());});controls.append(input);
    }
    const suffix=document.createElement('small');suffix.textContent=unit;controls.append(suffix);row.append(controls);
  }
  color(parent,label,key) {
    const row=this.row(parent,label),controls=document.createElement('div');controls.className='sub-color-pair';
    const picker=document.createElement('input');picker.type='color';picker.setAttribute('aria-label',label);
    const hex=document.createElement('input');hex.type='text';hex.maxLength=7;hex.setAttribute('aria-label',label+' hex');hex.spellcheck=false;
    this.register(key,picker,()=>picker.value,v=>picker.value=v);
    this.register(key,hex,()=>{const valid=/^#[\da-f]{6}$/i.test(hex.value);hex.setAttribute('aria-invalid',String(!valid));return valid?hex.value:undefined;},v=>{hex.value=v;hex.setAttribute('aria-invalid','false');});
    hex.addEventListener('blur',()=>this.sync(this.getStyle()));controls.append(picker,hex);row.append(controls);
  }
  toggle(parent,label,key) {
    const b=this.button(label,()=>this.change({[key]:!this.getStyle()[key]}));b.className='sub-toggle-button';b.dataset.style=key;parent.append(b);
    (this.inputs.get(key)||this.inputs.set(key,[]).get(key)).push({control:b,write:v=>b.setAttribute('aria-pressed',String(v))});
  }
  cards(parent,key,options,labels,extra='') {
    const group=document.createElement('div');group.className='sub-option-grid '+extra;group.setAttribute('role','group');group.setAttribute('aria-label',key);
    const icons={'None':'—','Fade In':'◐','Pop In':'◉','Pop In Bounce':'↟','Slide Up':'↑','Slide Down':'↓','Slide Left':'←','Slide Right':'→','Zoom In':'⊕','Typewriter':'⌨','Fade + Slide Up':'⇡','Fade Out':'◑','Pop Out':'⊖','Color highlight':'◈','Bold highlight':'B','Scale highlight':'↗','Underline':'U̲','Box highlight':'▣','Fade per word':'◌','Pop per word':'●'};
    options.forEach((value,i)=>{const b=this.button(labels?.[i] || `${icons[value] || '▪'} ${value}`,()=>this.change({[key]:value}));b.dataset.style=key;b.dataset.value=value;b.setAttribute('aria-label',key==='anchor'?'Anclaje '+value:String(value));group.append(b);
      (this.inputs.get(key)||this.inputs.set(key,[]).get(key)).push({control:b,write:v=>b.setAttribute('aria-pressed',String(v===value))});});parent.append(group);
  }
  sync(style,header) {if(header)this.header.textContent=header;for(const [key,entries] of this.inputs)for(const e of entries)e.write(style[key]);this.updateFonts();}
  updateFonts() {
    const style=this.getStyle();
    for(const option of this.inputs.get('font')[0].control.options) option.textContent=option.value+(this.fonts.length && !this.fonts.includes(option.value)?' · no instalada':'');
    this.fontNotice.textContent=this.fontError?'No se pudieron verificar las fuentes: '+this.fontError:this.fonts.length && !this.fonts.includes(style.font)?`Instala ${style.font} o elige una fuente instalada antes de aplicar.`:'';
  }
  refreshPresets() {this.presetSelect.replaceChildren(new Option('Cargar preset…',''));this.presets.forEach((p,i)=>this.presetSelect.add(new Option(p.name,String(i))));}
  savePreset() {
    const name=this.presetName.value.trim();if(!name){this.notice.textContent='Escribe un nombre para guardar el preset.';this.presetName.focus();return;}
    const next=this.presets.filter(p=>p.name!==name);next.push({name,style:{...this.getStyle()}});
    try {SubtitleStyleStore.save(next);this.presets=next;this.refreshPresets();this.presetSelect.value=String(next.length-1);this.notice.textContent='Preset guardado.';}catch(e){this.notice.textContent='No se pudo guardar: '+e.message;}
  }
  deletePreset() {
    if(this.presetSelect.value==='')return;const next=this.presets.filter((_,i)=>i!==Number(this.presetSelect.value));
    try {SubtitleStyleStore.save(next);this.presets=next;this.refreshPresets();this.notice.textContent='Preset eliminado.';}catch(e){this.notice.textContent=e.message;}
  }
}
