/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, Download, Copy, Loader2, Image as ImageIcon, Wand2, Printer } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const documentSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Título do projeto" },
    author: { type: Type.STRING, description: "Autor ou estúdio" },
    date: { type: Type.STRING, description: "Data no formato DD/MM/YYYY" },
    version: { type: Type.STRING },
    artisticFeatures: {
      type: Type.OBJECT,
      properties: {
        style: { type: Type.STRING },
        technique: { type: Type.STRING },
        format: { type: Type.STRING },
        details: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    },
    projectElements: {
      type: Type.OBJECT,
      properties: {
        mainCharacter: { type: Type.STRING },
        pose: { type: Type.STRING },
        visualNarrative: { type: Type.STRING }
      }
    },
    applications: { type: Type.ARRAY, items: { type: Type.STRING } },
    copyright: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        protection: { type: Type.STRING }
      }
    }
  },
  required: ["title", "author", "date", "version", "artisticFeatures", "projectElements", "applications", "copyright"]
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [protocol, setProtocol] = useState('');
  
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<any | null>(null);
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'doc' | 'image'>('doc');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setGeneratedDoc(null);
        setGeneratedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setGeneratedDoc(null);
        setGeneratedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateDocument = async () => {
    if (!image) return;
    setIsGeneratingDoc(true);
    setActiveTab('doc');
    
    try {
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      const prompt = `Analise a imagem fornecida e gere os dados para uma Ficha Técnica de Projeto de PI.
Preencha os campos com base no que você vê na imagem e nos dados adicionais fornecidos. Se um dado adicional não for fornecido, invente um ou deixe um espaço reservado adequado.

Dados adicionais fornecidos pelo usuário:
Título: ${title || 'Não fornecido'}
Autor/Estúdio: ${author || 'Não fornecido'}

Retorne os dados estritamente no formato JSON solicitado.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: documentSchema,
        }
      });

      const jsonStr = response.text?.trim() || '{}';
      const data = JSON.parse(jsonStr);
      setGeneratedDoc(data);
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Ocorreu um erro ao gerar o documento. Por favor, tente novamente.');
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const generateArt = async () => {
    if (!image) return;
    setIsGeneratingImage(true);
    setActiveTab('image');
    
    try {
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      // Improved prompt for a true pencil sketch look
      const prompt = `A highly detailed, realistic pencil sketch of the provided image. 
Hand-drawn graphite on textured white paper. 
Visible pencil strokes, dense cross-hatching for shading and depth. 
Rough construction lines visible. 
Black and white, monochrome, grayscale. 
Concept art sketch style, traditional media look. 
Focus entirely on the main subject.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt },
          ],
        },
      });

      let foundImage = false;
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            setGeneratedImage(`data:image/png;base64,${base64EncodeString}`);
            foundImage = true;
            break;
          }
        }
      }
      
      if (!foundImage) {
        alert('A IA não retornou uma imagem. Tente novamente.');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Ocorreu um erro ao gerar a arte. Por favor, tente novamente.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const downloadPDF = async () => {
    const docElement = document.getElementById('printable-document');
    if (!docElement) return;

    setIsExporting(true);
    try {
      // Capture the first page (Technical Sheet)
      const canvas = await html2canvas(docElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      // If we have a generated image, add it as a second page
      if (generatedImage) {
        pdf.addPage();
        
        const margin = 20;
        
        // Add Header to second page
        pdf.setFontSize(10);
        pdf.setTextColor(90, 85, 210); // #5a55d2
        pdf.setFont("helvetica", "bold");
        pdf.text("MANGACRAFT", margin, margin);
        
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text("ADAPTATION ENGINE V6.0", margin, margin + 4);
        
        pdf.setFontSize(8);
        pdf.text("DOCUMENT TYPE", pdfWidth - margin, margin, { align: 'right' });
        
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("CONCEPT ART REFERENCE", pdfWidth - margin, margin + 4, { align: 'right' });
        
        // Load and add the image
        const img = new Image();
        img.src = generatedImage;
        await new Promise(resolve => { img.onload = resolve; });
        
        const maxImgWidth = pdfWidth - (margin * 2);
        const maxImgHeight = pdf.internal.pageSize.getHeight() - (margin * 2) - 40;
        
        let imgW = img.width;
        let imgH = img.height;
        const ratio = Math.min(maxImgWidth / imgW, maxImgHeight / imgH);
        
        imgW = imgW * ratio;
        imgH = imgH * ratio;
        
        const x = (pdfWidth - imgW) / 2;
        const y = margin + 20;
        
        pdf.addImage(generatedImage, 'PNG', x, y, imgW, imgH);
        
        // Add Footer to second page
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        const footerText = "This document is a technical asset of the production. Unauthorized distribution is prohibited. Generated via MangaCraft B2B Adaptation Engine.";
        pdf.text(footerText, pdfWidth - margin, pdf.internal.pageSize.getHeight() - margin, { align: 'right' });
      }
      
      pdf.save(`${title || 'Ficha_Tecnica_MangaCraft'}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar o PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const downloadImage = () => {
    if (generatedImage) {
      const element = document.createElement('a');
      element.href = generatedImage;
      element.download = 'arte_conceitual_pi.png';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Wand2 size={18} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">MangaCraft Arte Conceitual</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-6 no-print">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-medium mb-4">1. Upload da Imagem Base</h2>
              
              <div 
                className="border-2 border-dashed border-neutral-300 rounded-xl p-8 text-center hover:bg-neutral-50 transition-colors cursor-pointer group relative overflow-hidden"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                {image ? (
                  <div className="absolute inset-0 w-full h-full">
                    <img src={image} alt="Preview" className="w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ImageIcon className="w-8 h-8 text-neutral-700 mb-2" />
                      <span className="text-sm font-medium text-neutral-700 bg-white/80 px-3 py-1 rounded-full backdrop-blur-sm">Trocar imagem</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Upload size={24} />
                    </div>
                    <p className="text-sm font-medium text-neutral-700">Clique ou arraste uma imagem</p>
                    <p className="text-xs text-neutral-500 mt-1">PNG, JPG, WEBP até 10MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-medium mb-4">2. Dados do Projeto</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-neutral-700 mb-1">
                    Título do Projeto
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Guerreiro Místico"
                    className="w-full px-4 py-2 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="author" className="block text-sm font-medium text-neutral-700 mb-1">
                    Autor / Estúdio
                  </label>
                  <input
                    type="text"
                    id="author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Ex: Mangacraft Studio"
                    className="w-full px-4 py-2 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="protocol" className="block text-sm font-medium text-neutral-700 mb-1">
                    Protocolo de Registro (Opcional)
                  </label>
                  <input
                    type="text"
                    id="protocol"
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    placeholder="Ex: BR 10 2024 001234 5"
                    className="w-full px-4 py-2 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={generateDocument}
                disabled={!image || isGeneratingDoc || isGeneratingImage}
                className="w-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {isGeneratingDoc ? (
                  <><Loader2 className="animate-spin" size={20} /> Analisando...</>
                ) : (
                  <><FileText size={20} /> Gerar Ficha Técnica</>
                )}
              </button>

              <button
                onClick={generateArt}
                disabled={!image || isGeneratingDoc || isGeneratingImage}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {isGeneratingImage ? (
                  <><Loader2 className="animate-spin" size={20} /> Desenhando...</>
                ) : (
                  <><Wand2 size={20} /> Converter para Arte a Lápis</>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 h-full min-h-[600px] flex flex-col overflow-hidden no-print-container">
              
              {/* Tabs */}
              <div className="flex border-b border-neutral-200 bg-neutral-50/50 no-print">
                <button
                  onClick={() => setActiveTab('doc')}
                  className={`flex-1 py-4 px-6 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'doc' ? 'bg-white border-b-2 border-indigo-600 text-indigo-600' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
                >
                  <FileText size={18} />
                  Ficha Técnica
                </button>
                <button
                  onClick={() => setActiveTab('image')}
                  className={`flex-1 py-4 px-6 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'image' ? 'bg-white border-b-2 border-indigo-600 text-indigo-600' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
                >
                  <ImageIcon size={18} />
                  Arte Conceitual
                </button>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 overflow-auto bg-neutral-200/50 flex flex-col relative">
                {activeTab === 'doc' && (
                  <>
                    <div className="sticky top-0 right-0 p-4 flex justify-end z-10 no-print pointer-events-none">
                      {generatedDoc && (
                        <button 
                          onClick={downloadPDF} 
                          disabled={isExporting}
                          className="pointer-events-auto flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
                          {isExporting ? 'Gerando PDF...' : 'Exportar PDF'}
                        </button>
                      )}
                    </div>
                    
                    {generatedDoc ? (
                      <div className="p-8 flex justify-center">
                        {/* Professional A4 Document Preview */}
                        <div id="printable-document" className="bg-white w-full max-w-[210mm] min-h-[297mm] p-[20mm] shadow-xl flex flex-col relative print:shadow-none print:p-0">
                          
                          {/* Header */}
                          <div className="flex justify-between items-start mb-20">
                            <div>
                              <h1 className="text-[#5a55d2] font-bold tracking-[0.2em] text-sm">MANGACRAFT</h1>
                              <p className="text-gray-400 text-xs font-medium tracking-wider">ADAPTATION ENGINE V6.0</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-400 text-xs font-medium tracking-wider">DOCUMENT TYPE</p>
                              <p className="text-black font-bold text-sm">TECHNICAL CONCEPT SHEET</p>
                            </div>
                          </div>

                          {/* Title Section */}
                          <div className="text-center mb-20">
                            <p className="text-gray-400 text-xs font-bold tracking-[0.2em] mb-4">PRODUCTION TITLE</p>
                            <h2 className="text-5xl md:text-6xl font-display italic text-[#5a55d2] mb-6 uppercase tracking-tight leading-tight">
                              {title || generatedDoc.title}
                            </h2>
                            <div className="w-24 h-1 bg-[#5a55d2] mx-auto mb-8"></div>
                            <p className="text-gray-400 text-xs font-bold tracking-[0.2em] mb-2">ORIGINAL AUTHOR</p>
                            <p className="text-xl font-bold text-black uppercase">{author || generatedDoc.author}</p>
                          </div>

                          {/* Content Section */}
                          <div className="grid grid-cols-2 gap-12 mb-16 text-sm flex-grow">
                            {/* Left Column */}
                            <div>
                              <h3 className="font-bold text-[#5a55d2] mb-4 border-b border-gray-200 pb-2 tracking-wider text-xs uppercase">Características Artísticas</h3>
                              <ul className="space-y-3 text-gray-700">
                                <li><span className="font-semibold text-black">Estilo:</span> {generatedDoc.artisticFeatures?.style}</li>
                                <li><span className="font-semibold text-black">Técnica:</span> {generatedDoc.artisticFeatures?.technique}</li>
                                <li><span className="font-semibold text-black">Formato:</span> {generatedDoc.artisticFeatures?.format}</li>
                                <li className="pt-2">
                                  <span className="font-semibold text-black block mb-1">Detalhes Técnicos:</span>
                                  <ul className="list-disc pl-5 space-y-1 text-gray-600">
                                    {generatedDoc.artisticFeatures?.details?.map((d: string, i: number) => <li key={i}>{d}</li>)}
                                  </ul>
                                </li>
                              </ul>
                            </div>
                            
                            {/* Right Column */}
                            <div>
                              <h3 className="font-bold text-[#5a55d2] mb-4 border-b border-gray-200 pb-2 tracking-wider text-xs uppercase">Elementos do Projeto</h3>
                              <ul className="space-y-3 text-gray-700 mb-8">
                                <li><span className="font-semibold text-black block mb-1">Personagem Principal:</span> {generatedDoc.projectElements?.mainCharacter}</li>
                                <li><span className="font-semibold text-black block mb-1">Pose/Ação:</span> {generatedDoc.projectElements?.pose}</li>
                                <li><span className="font-semibold text-black block mb-1">Narrativa Visual:</span> {generatedDoc.projectElements?.visualNarrative}</li>
                              </ul>
                              
                              <h3 className="font-bold text-[#5a55d2] mb-4 border-b border-gray-200 pb-2 tracking-wider text-xs uppercase">Aplicações & Direitos</h3>
                              <ul className="space-y-3 text-gray-700">
                                <li>
                                  <span className="font-semibold text-black block mb-1">Aplicações Sugeridas:</span>
                                  <ul className="list-disc pl-5 space-y-1 text-gray-600">
                                    {generatedDoc.applications?.map((app: string, i: number) => <li key={i}>{app}</li>)}
                                  </ul>
                                </li>
                                <li className="pt-2"><span className="font-semibold text-black">Status:</span> {generatedDoc.copyright?.status}</li>
                                
                                {/* Hardcoded Copyright Law Text */}
                                <li><span className="font-semibold text-black">Proteção:</span> Protegido pela Lei de Direitos Autorais (Lei nº 9.610/98) - {generatedDoc.copyright?.protection}</li>
                                
                                {/* Protocol Field */}
                                {protocol && (
                                  <li><span className="font-semibold text-black">Protocolo de Registro:</span> {protocol}</li>
                                )}
                              </ul>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-auto pt-8 border-t border-gray-100 flex justify-between items-end text-xs">
                            <div>
                              <p className="text-gray-400 font-bold tracking-wider mb-1">DEPARTMENT</p>
                              <p className="font-bold text-black mb-6">VISUAL DEVELOPMENT / CONCEPT ART</p>
                              <p className="text-gray-400 font-bold tracking-wider mb-1">DATE OF ISSUE</p>
                              <p className="font-bold text-black">{generatedDoc.date}</p>
                            </div>
                            <div className="text-right max-w-[250px]">
                              <p className="text-gray-400 font-bold tracking-wider mb-8 text-left">TECHNICAL DIRECTOR RESPONSIBLE</p>
                              <div className="border-b border-gray-300 mb-2 w-full"></div>
                              <p className="text-gray-400 italic text-[10px] text-left">Signature / Digital Approval</p>
                              <p className="text-gray-400 text-[9px] mt-6 text-left leading-relaxed">
                                This document is a technical asset of the production. Unauthorized distribution is prohibited. Generated via MangaCraft B2B Adaptation Engine.
                              </p>
                            </div>
                          </div>

                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-6 bg-white m-6 rounded-xl border border-neutral-200">
                        <FileText size={48} className="mb-4 opacity-20" />
                        <p className="text-center max-w-sm">Gere a ficha técnica para ver o documento formatado aqui.</p>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'image' && (
                  <>
                    <div className="flex justify-end p-4 no-print">
                      {generatedImage && (
                        <button onClick={downloadImage} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
                          <Download size={18} />
                          Baixar Imagem
                        </button>
                      )}
                    </div>
                    {generatedImage ? (
                      <div className="flex-1 flex items-center justify-center p-6">
                        <div className="bg-white p-4 rounded-xl shadow-xl border border-neutral-200">
                          <img src={generatedImage} alt="Arte Conceitual Gerada" className="max-w-full max-h-[700px] object-contain rounded-lg" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-6 bg-white m-6 rounded-xl border border-neutral-200">
                        <Wand2 size={48} className="mb-4 opacity-20" />
                        <p className="text-center max-w-sm">Converta sua imagem para o estilo técnico a lápis para ver o resultado aqui.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}
